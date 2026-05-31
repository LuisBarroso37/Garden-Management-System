# API Manual Testing — cURL Commands

Sequential commands to test all routes. Run with the dev server running on `http://localhost:3000`.

## Health Check

```bash
curl -sS http://localhost:3000/health-check
```

---

## Auth

### Register

```bash
RESPONSE=$(curl -sS -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "SecureP@ss123",
    "firstName": "John",
    "lastName": "Doe",
    "age": 30
  }')

echo "$RESPONSE"
export ACCESS_TOKEN=$(echo "$RESPONSE" | jq -r '.tokens.accessToken')
export REFRESH_TOKEN=$(echo "$RESPONSE" | jq -r '.tokens.refreshToken')
```

### Login

```bash
RESPONSE=$(curl -sS -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "SecureP@ss123"
  }')

echo "$RESPONSE"
export ACCESS_TOKEN=$(echo "$RESPONSE" | jq -r '.tokens.accessToken')
export REFRESH_TOKEN=$(echo "$RESPONSE" | jq -r '.tokens.refreshToken')
```

### Get Profile

```bash
curl -sS http://localhost:3000/api/auth/me \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

### Refresh Token

```bash
RESPONSE=$(curl -sS -X POST http://localhost:3000/api/auth/refresh \
  -H "Content-Type: application/json" \
  -d "{\"refreshToken\": \"$REFRESH_TOKEN\"}")

echo "$RESPONSE"
export ACCESS_TOKEN=$(echo "$RESPONSE" | jq -r '.accessToken')
export REFRESH_TOKEN=$(echo "$RESPONSE" | jq -r '.refreshToken')
```

### Logout

```bash
curl -sS -X POST http://localhost:3000/api/auth/logout \
  -H "Content-Type: application/json" \
  -d "{\"refreshToken\": \"$REFRESH_TOKEN\"}"
```

---

## Gardens

### Create Garden

```bash
export GARDEN_ID=$(curl -sS -X POST http://localhost:3000/api/gardens \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -d '{
    "name": "Backyard Garden",
    "totalSurfaceArea": 50.5,
    "locationDescription": "Behind the house",
    "targetHumidityLevel": 65
  }' | jq -r '.id')
```

### List Gardens

```bash
curl -sS http://localhost:3000/api/gardens \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

### Get Garden

```bash
curl -sS http://localhost:3000/api/gardens/$GARDEN_ID \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

### Update Garden

```bash
curl -sS -X PUT http://localhost:3000/api/gardens/$GARDEN_ID \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -d '{
    "name": "Updated Garden Name",
    "targetHumidityLevel": 70
  }'
```

### Delete Garden (run last)

```bash
curl -sS -X DELETE http://localhost:3000/api/gardens/$GARDEN_ID \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

---

## Plants

### Create Plant

```bash
export PLANT_ID=$(curl -sS -X POST http://localhost:3000/api/gardens/$GARDEN_ID/plants \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -d '{
    "name": "Tomato",
    "species": "Solanum lycopersicum",
    "plantType": "vegetable",
    "plantationDate": "2025-03-15T10:00:00Z",
    "surfaceAreaRequired": 2.5,
    "idealHumidityLevel": 60
  }' | jq -r '.id')
```

### Create a Second Plant (fruit)

```bash
curl -sS -X POST http://localhost:3000/api/gardens/$GARDEN_ID/plants \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -d '{
    "name": "Strawberry",
    "species": "Fragaria × ananassa",
    "plantType": "fruit",
    "plantationDate": "2025-03-20T08:00:00Z",
    "surfaceAreaRequired": 1.0,
    "idealHumidityLevel": 55
  }'
```

### List Plants

```bash
curl -sS http://localhost:3000/api/gardens/$GARDEN_ID/plants \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

### Get Plant

```bash
curl -sS http://localhost:3000/api/gardens/$GARDEN_ID/plants/$PLANT_ID \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

### Update Plant

```bash
curl -sS -X PUT http://localhost:3000/api/gardens/$GARDEN_ID/plants/$PLANT_ID \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -d '{
    "name": "Cherry Tomato",
    "idealHumidityLevel": 65
  }'
```

### Delete Plant

```bash
curl -sS -X DELETE http://localhost:3000/api/gardens/$GARDEN_ID/plants/$PLANT_ID \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

---

## Irrigation

### Trigger Irrigation Cycle

```bash
curl -sS -X POST http://localhost:3000/api/irrigation \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -d "{\"gardenId\": \"$GARDEN_ID\"}"
```

---

## Reports

### Get Garden Report

```bash
curl -sS "http://localhost:3000/api/reports?gardenId=$GARDEN_ID&from=2025-03-01T00:00:00Z&to=2025-12-31T23:59:59Z" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

---

## Cleanup — Delete Account

```bash
curl -sS -X DELETE http://localhost:3000/api/auth/account \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```
