import { Kysely } from 'kysely';
import { DB } from '../db/types.js';
import bcrypt from 'bcrypt';
import { DatabaseError } from 'pg';
import { createKyselyDatabaseClient } from '../db/index.js';
import {
  refreshTokenRecordSchema,
  RegisterInput,
  registerSchema,
  userResponseSchema,
} from '../schemas/auth.js';
import { z } from 'zod/v4';

const SALT_ROUNDS = 12;

export class EmailAlreadyExistsError extends Error {
  constructor(email: string) {
    super(`User with email [${email}] already exists`);
  }
}

export class InvalidCredentialsError extends Error {
  constructor() {
    super('Invalid email or password');
  }
}

export class InvalidRefreshTokenError extends Error {
  constructor() {
    super('Invalid or expired refresh token');
  }
}

export const createAuthConnector = (database: Kysely<DB>) => {
  const register = async (input: RegisterInput) => {
    const passwordHash = await bcrypt.hash(input.password, SALT_ROUNDS);

    try {
      const user = await database
        .insertInto('user')
        .values({
          email: input.email,
          passwordHash,
          firstName: input.firstName,
          lastName: input.lastName,
          age: input.age,
        })
        .returning(['id', 'email', 'firstName', 'lastName', 'age', 'createdAt'])
        .executeTakeFirstOrThrow();

      return user;
    } catch (error) {
      if (error instanceof DatabaseError && error.code === '23505') {
        throw new EmailAlreadyExistsError(input.email);
      }
      throw error;
    }
  };

  const verifyCredentials = async (email: string, password: string) => {
    const user = await database
      .selectFrom('user')
      .where('email', '=', email)
      .select(['id', 'email', 'firstName', 'lastName', 'age', 'createdAt', 'passwordHash'])
      .executeTakeFirst();

    if (!user) {
      throw new InvalidCredentialsError();
    }

    const isValid = await bcrypt.compare(password, user.passwordHash);

    if (!isValid) {
      throw new InvalidCredentialsError();
    }

    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      age: user.age,
      createdAt: user.createdAt,
    };
  };

  const storeRefreshToken = async (userId: string, tokenHash: string, expiresAt: Date) => {
    await database
      .insertInto('refresh_token')
      .values({
        userId,
        tokenHash,
        expiresAt: expiresAt.toISOString(),
      })
      .execute();
  };

  const verifyRefreshToken = async (tokenHash: string) => {
    const record = await database
      .selectFrom('refresh_token')
      .where('tokenHash', '=', tokenHash)
      .where('expiresAt', '>', new Date().toISOString())
      .select(['id', 'userId'])
      .executeTakeFirst();

    if (!record) {
      throw new InvalidRefreshTokenError();
    }

    return record;
  };

  const revokeRefreshToken = async (tokenHash: string) => {
    await database.deleteFrom('refresh_token').where('tokenHash', '=', tokenHash).execute();
  };

  const revokeAllUserTokens = async (userId: string) => {
    await database.deleteFrom('refresh_token').where('userId', '=', userId).execute();
  };

  const deleteUser = async (userId: string) => {
    await database.deleteFrom('user').where('id', '=', userId).execute();
  };

  const getUserById = async (userId: string) => {
    return database
      .selectFrom('user')
      .where('id', '=', userId)
      .select(['id', 'email', 'firstName', 'lastName', 'age', 'createdAt'])
      .executeTakeFirst();
  };

  return {
    register: z
      .function({ input: [registerSchema], output: userResponseSchema })
      .implementAsync(register),
    verifyCredentials: z
      .function({
        input: [z.email(), z.string()],
        output: userResponseSchema,
      })
      .implementAsync(verifyCredentials),
    storeRefreshToken: z
      .function({ input: [z.uuid(), z.string(), z.date()], output: z.void() })
      .implementAsync(storeRefreshToken),
    verifyRefreshToken: z
      .function({ input: [z.string()], output: refreshTokenRecordSchema })
      .implementAsync(verifyRefreshToken),
    revokeRefreshToken: z
      .function({ input: [z.string()], output: z.void() })
      .implementAsync(revokeRefreshToken),
    revokeAllUserTokens: z
      .function({ input: [z.uuid()], output: z.void() })
      .implementAsync(revokeAllUserTokens),
    deleteUser: z.function({ input: [z.uuid()], output: z.void() }).implementAsync(deleteUser),
    getUserById: z
      .function({ input: [z.uuid()], output: userResponseSchema.optional() })
      .implementAsync(getUserById),
  };
};

export const authConnector = createAuthConnector(createKyselyDatabaseClient());
export type AuthConnector = ReturnType<typeof createAuthConnector>;
