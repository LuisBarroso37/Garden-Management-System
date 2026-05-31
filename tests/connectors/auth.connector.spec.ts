import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Kysely } from 'kysely';
import bcrypt from 'bcrypt';
import type { DB } from '../../src/db/types.js';
import {
  createAuthConnector,
  EmailAlreadyExistsError,
  InvalidCredentialsError,
  InvalidRefreshTokenError,
} from '../../src/connectors/auth.connector.js';
import { startTestDatabase } from '../setup/start-postgres-database.js';
import { hashToken } from '../../src/utils/auth.js';

describe('AuthConnector', () => {
  let databaseSetup: Awaited<ReturnType<typeof startTestDatabase>>;
  let database: Kysely<DB>;
  let authConnector: ReturnType<typeof createAuthConnector>;

  const validRegisterInput = {
    email: 'test@example.com',
    password: 'SecureP@ss123',
    firstName: 'John',
    lastName: 'Doe',
    age: 30,
  };

  beforeAll(async () => {
    databaseSetup = await startTestDatabase();
    database = databaseSetup.database;
    authConnector = createAuthConnector(database);
  });

  beforeEach(async () => {
    await databaseSetup.truncate('refresh_token');
    await databaseSetup.truncate('user');
  });

  afterAll(async () => {
    await databaseSetup.teardown();
  });

  describe('register', () => {
    it('should create a user and return it without passwordHash', async () => {
      const user = await authConnector.register(validRegisterInput);

      expect(user.id).toBeDefined();
      expect(user.email).toBe(validRegisterInput.email);
      expect(user.firstName).toBe(validRegisterInput.firstName);
      expect(user.lastName).toBe(validRegisterInput.lastName);
      expect(user.age).toBe(validRegisterInput.age);
      expect(user.createdAt).toBeDefined();
      expect((user as { passwordHash?: string }).passwordHash).toBeUndefined();
    });

    it('should hash the password before storing', async () => {
      await authConnector.register(validRegisterInput);

      const dbUser = await database
        .selectFrom('user')
        .where('email', '=', validRegisterInput.email)
        .select('passwordHash')
        .executeTakeFirstOrThrow();

      expect(dbUser.passwordHash).not.toBe(validRegisterInput.password);

      const isValid = await bcrypt.compare(validRegisterInput.password, dbUser.passwordHash);
      expect(isValid).toBe(true);
    });

    it('should throw EmailAlreadyExistsError for duplicate email', async () => {
      await authConnector.register(validRegisterInput);

      await expect(authConnector.register(validRegisterInput)).rejects.toThrow(
        EmailAlreadyExistsError,
      );
    });
  });

  describe('verifyCredentials', () => {
    beforeEach(async () => {
      await authConnector.register(validRegisterInput);
    });

    it('should return the user without passwordHash for valid credentials', async () => {
      const user = await authConnector.verifyCredentials(
        validRegisterInput.email,
        validRegisterInput.password,
      );

      expect(user.email).toBe(validRegisterInput.email);
      expect(user.firstName).toBe(validRegisterInput.firstName);
      expect((user as { passwordHash?: string }).passwordHash).toBeUndefined();
    });

    it('should throw InvalidCredentialsError for wrong password', async () => {
      await expect(
        authConnector.verifyCredentials(validRegisterInput.email, 'wrong-password'),
      ).rejects.toThrow(InvalidCredentialsError);
    });

    it('should throw InvalidCredentialsError for non-existent email', async () => {
      await expect(
        authConnector.verifyCredentials('nonexistent@example.com', 'password'),
      ).rejects.toThrow(InvalidCredentialsError);
    });
  });

  describe('storeRefreshToken', () => {
    it('should store a hashed refresh token in the database', async () => {
      const user = await authConnector.register(validRegisterInput);
      const tokenHash = hashToken('my-refresh-token');
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

      await authConnector.storeRefreshToken(user.id, tokenHash, expiresAt);

      const stored = await database
        .selectFrom('refresh_token')
        .where('userId', '=', user.id)
        .select(['tokenHash', 'expiresAt'])
        .executeTakeFirstOrThrow();

      expect(stored.tokenHash).toBe(tokenHash);
    });
  });

  describe('verifyRefreshToken', () => {
    it('should return the record for a valid non-expired token', async () => {
      const user = await authConnector.register(validRegisterInput);
      const tokenHash = hashToken('valid-token');
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour from now

      await authConnector.storeRefreshToken(user.id, tokenHash, expiresAt);

      const record = await authConnector.verifyRefreshToken(tokenHash);

      expect(record.userId).toBe(user.id);
      expect(record.id).toBeDefined();
    });

    it('should throw InvalidRefreshTokenError for an expired token', async () => {
      const user = await authConnector.register(validRegisterInput);
      const tokenHash = hashToken('expired-token');
      const expiresAt = new Date(Date.now() - 1000); // already expired

      await authConnector.storeRefreshToken(user.id, tokenHash, expiresAt);

      await expect(authConnector.verifyRefreshToken(tokenHash)).rejects.toThrow(
        InvalidRefreshTokenError,
      );
    });

    it('should throw InvalidRefreshTokenError for a non-existent token', async () => {
      await expect(authConnector.verifyRefreshToken('nonexistent-hash')).rejects.toThrow(
        InvalidRefreshTokenError,
      );
    });
  });

  describe('revokeRefreshToken', () => {
    it('should delete the token from the database', async () => {
      const user = await authConnector.register(validRegisterInput);
      const tokenHash = hashToken('to-revoke');
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

      await authConnector.storeRefreshToken(user.id, tokenHash, expiresAt);
      await authConnector.revokeRefreshToken(tokenHash);

      const result = await database
        .selectFrom('refresh_token')
        .where('tokenHash', '=', tokenHash)
        .select('id')
        .executeTakeFirst();

      expect(result).toBeUndefined();
    });
  });

  describe('revokeAllUserTokens', () => {
    it('should delete all refresh tokens for a user', async () => {
      const user = await authConnector.register(validRegisterInput);
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

      await authConnector.storeRefreshToken(user.id, hashToken('token-1'), expiresAt);
      await authConnector.storeRefreshToken(user.id, hashToken('token-2'), expiresAt);
      await authConnector.storeRefreshToken(user.id, hashToken('token-3'), expiresAt);

      await authConnector.revokeAllUserTokens(user.id);

      const tokens = await database
        .selectFrom('refresh_token')
        .where('userId', '=', user.id)
        .select('id')
        .execute();

      expect(tokens).toHaveLength(0);
    });
  });

  describe('deleteUser', () => {
    it('should remove the user from the database', async () => {
      const user = await authConnector.register(validRegisterInput);

      await authConnector.deleteUser(user.id);

      const result = await database
        .selectFrom('user')
        .where('id', '=', user.id)
        .select('id')
        .executeTakeFirst();

      expect(result).toBeUndefined();
    });

    it('should cascade delete refresh tokens', async () => {
      const user = await authConnector.register(validRegisterInput);
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
      await authConnector.storeRefreshToken(user.id, hashToken('token'), expiresAt);

      await authConnector.deleteUser(user.id);

      const tokens = await database
        .selectFrom('refresh_token')
        .where('userId', '=', user.id)
        .select('id')
        .execute();

      expect(tokens).toHaveLength(0);
    });
  });

  describe('getUserById', () => {
    it('should return the user without passwordHash', async () => {
      const registered = await authConnector.register(validRegisterInput);

      const user = await authConnector.getUserById(registered.id);

      expect(user).toBeDefined();
      expect(user!.email).toBe(validRegisterInput.email);
      expect((user as { passwordHash?: string }).passwordHash).toBeUndefined();
    });

    it('should return undefined for a non-existent user', async () => {
      const user = await authConnector.getUserById('550e8400-e29b-41d4-a716-446655440099');

      expect(user).toBeUndefined();
    });
  });
});
