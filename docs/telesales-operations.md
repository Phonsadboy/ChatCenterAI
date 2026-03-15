# TeleSales Operations

This note covers operational tasks for TeleSales users without building UI first.

## Railway CLI

The workspace is already linked to Railway. You can manage sales users against the active service environment with:

```bash
railway status
```

## Sales User Commands

List sales users:

```bash
railway run node scripts/manage-sales-user.js list
```

Create a sales user:

```bash
SALES_USER_PASSWORD='supersecret' \
railway run node scripts/manage-sales-user.js create \
  --name "Alice" \
  --code sale01 \
  --role sales \
  --phone 0890000000
```

Create a sales manager:

```bash
SALES_USER_PASSWORD='supersecret' \
railway run node scripts/manage-sales-user.js create \
  --name "Team Lead" \
  --code lead01 \
  --role sales_manager
```

Update an existing sales user:

```bash
railway run node scripts/manage-sales-user.js update \
  --code sale01 \
  --name "Alice New" \
  --active=true
```

Update password:

```bash
railway run node scripts/manage-sales-user.js update \
  --code sale01 \
  --password 'newpassword'
```

## Supported Commands

- `list`
- `create`
- `update`

Supported options:

- `--name`
- `--code`
- `--password`
- `--role` (`sales` or `sales_manager`)
- `--phone`
- `--team-id`
- `--active`
- `--id` for update by Mongo id

## Notes

- `code` is stored in lowercase.
- Password must be at least 4 characters.
- Create reads `SALES_USER_PASSWORD` if `--password` is omitted.
- Update changes password only when `--password` is passed.
- The script connects with `MONGO_URI` or `MONGODB_URI` from Railway env.
- The target database defaults to `chatbot`, or `MONGO_DB_NAME` if set.
