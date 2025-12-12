# Cloudflare KV Setup for Markdown Notes

## Step 1: Create KV Namespace

1. Go to [Cloudflare Dashboard](https://dash.cloudflare.com)
2. Select your account → **Workers & Pages** → **KV**
3. Click **Create a namespace**
4. Name it: `SHARED_NOTES`
5. Click **Add**

## Step 2: Bind KV to Your Pages Project

1. Go to **Workers & Pages** → Select your project (`markdown.toontamilindia.in`)
2. Go to **Settings** → **Functions** → **KV namespace bindings**
3. Click **Add binding**
4. Set:
   - **Variable name**: `SHARED_NOTES`
   - **KV namespace**: Select the `SHARED_NOTES` namespace you created
5. Click **Save**

## Step 3: Deploy

1. Deploy your project (push to Git or upload files)
2. The `_worker.js` file will automatically handle routing

## How It Works

- **POST /api/share** - Save a note (called when you click Share with an alias)
- **GET /api/note/:alias** - Get a note by alias
- **DELETE /api/note/:alias** - Delete a note (requires master key header)
- **GET /api/list** - List all notes (requires master key header)
- **GET /api/check/:alias** - Check if alias is available

## Usage

1. Create a note in the editor
2. Add a custom alias (e.g., "my-note")
3. Click **Share** → Note automatically saves to KV!
4. Share the URL: `https://markdown.toontamilindia.in/my-note`

## Master Key Configuration

The master key is required for admin operations:
- Viewing all shared notes in the Manage tab
- Deleting notes from KV storage

**Security Best Practice:** Configure the master key as an environment variable:

1. Go to Cloudflare Dashboard → Workers & Pages → Your Project
2. Go to **Settings** → **Variables**
3. Add a new variable:
   - **Variable name**: `MASTER_KEY`
   - **Value**: Your secure master key
4. Click **Encrypt** to store it securely
5. Save and redeploy

Alternatively, use Wrangler CLI:
```bash
wrangler secret put MASTER_KEY
```

## API Examples

```bash
# Save a note
curl -X POST https://markdown.toontamilindia.in/api/share \
  -H "Content-Type: application/json" \
  -d '{"alias":"test","data":"compressed-data","title":"Test Note"}'

# Get a note
curl https://markdown.toontamilindia.in/api/note/test

# List all notes (requires master key)
curl https://markdown.toontamilindia.in/api/list \
  -H "X-Master-Key: YOUR_MASTER_KEY"

# Delete a note (requires master key)
curl -X DELETE https://markdown.toontamilindia.in/api/note/test \
  -H "X-Master-Key: YOUR_MASTER_KEY"
```
