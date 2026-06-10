# Prompt 01 — Create Backup & Git Baseline

**Paste everything below this line into Claude Code:**

---

I am about to perform a series of significant refactors on this Electron application called "Bilim Hezinisi" (a Uyghur digital library, version 2.4.1). Before any code changes, I need you to create a safety baseline so I can roll back if something breaks.

## Your task

### Step 1 — Verify the project structure

Run these commands and show me the output:

```bash
pwd
ls -la
node --version
npm --version
cat package.json
```

Confirm that you see:
- `main.js`, `preload.js`, `database.js` in the root
- `src/` folder containing `index.html`, `notes.js`, `quran.js`, etc.
- `package.json` with `"name": "bilim-hezinisi"` and `"version": "2.4.1"`

If any of these are missing, **stop and tell me** before proceeding.

### Step 2 — Initialize git (if not already initialized)

Check if `.git` directory exists. If it does NOT:

```bash
git init
git config user.email "developer@bilim-hezinisi.local"
git config user.name "Bilim Hezinisi Developer"
```

### Step 3 — Create a `.gitignore`

Create or update `.gitignore` in the project root with this exact content:

```
# Dependencies
node_modules/
package-lock.json.bak

# Build output
dist/
out/
*.exe

# OS
.DS_Store
Thumbs.db

# Editor
.vscode/
.idea/
*.swp

# Logs
*.log
npm-debug.log*

# User data (local only — never commit)
JamiyKutupxana/

# Temporary files
*.tmp
*.bak
```

### Step 4 — Create a baseline commit

```bash
git add -A
git status
```

Show me the output of `git status`. If it looks correct (lots of source files staged, but no `node_modules/`), then commit:

```bash
git commit -m "Baseline: v2.4.1 working state before refactor"
git tag v2.4.1-baseline
git log --oneline
```

### Step 5 — Create a manual backup folder

In addition to git, also create a manual ZIP backup as a second safety net:

```bash
cd ..
```

Then create a backup folder. Use Node.js (since we don't know the OS shell):

Create a temporary file `backup-script.js` in the project's parent directory with this content:

```javascript
const fs = require('fs');
const path = require('path');

const PROJECT = path.basename(process.cwd() === '/' ? 'project' : process.argv[2]);
const SRC = path.resolve(process.argv[2]);
const DEST_PARENT = path.dirname(SRC);
const DEST = path.join(DEST_PARENT, PROJECT + '_BACKUP_v2.4.1');

if (fs.existsSync(DEST)) {
  console.log('Backup folder already exists at:', DEST);
  console.log('Delete it manually if you want a fresh backup.');
  process.exit(0);
}

function copyRecursive(src, dest) {
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    if (path.basename(src) === 'node_modules') return;
    if (path.basename(src) === '.git') return;
    if (path.basename(src) === 'dist') return;
    fs.mkdirSync(dest, { recursive: true });
    for (const child of fs.readdirSync(src)) {
      copyRecursive(path.join(src, child), path.join(dest, child));
    }
  } else {
    fs.copyFileSync(src, dest);
  }
}

copyRecursive(SRC, DEST);
console.log('Backup created at:', DEST);
```

Then run it from the project root:

```bash
node ../backup-script.js "$(pwd)"
```

(On Windows in PowerShell, use: `node ..\backup-script.js (Get-Location).Path`)

### Step 6 — Verify backup

After the script runs, show me:
- Confirmation that the backup folder was created
- The path of the backup folder

Delete the temporary backup script:

```bash
cd ..
rm backup-script.js
cd -
```

(On Windows: `cd ..; del backup-script.js; cd $OLDPWD` or just navigate back manually.)

### Step 7 — Final report

Show me a summary:
- ✅ Git initialized: yes/no
- ✅ Git baseline commit hash: [show the hash]
- ✅ Git tag created: v2.4.1-baseline
- ✅ Manual backup folder path: [show the path]
- ✅ Current working directory: [show pwd]

**Do NOT modify any source files in this prompt.** This prompt is purely about safety nets.

When you are done, tell me: "Baseline complete. Safe to proceed to PROMPT_02."
