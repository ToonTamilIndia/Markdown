<<<<<<< HEAD

---

### ⚠️ **Disclaimer**

*This repository contains vibe-coded scripts intended for personal use. 
Contributions are welcome, but breakages are expected 
and if something breaks, it’s a feature, not a bug.*

---

=======
>>>>>>> 03642ee (Initial commit: Add Worker, public folder, and project files)
# 📝 Markdown Notes - ToonTamilIndia

A beautiful, feature-rich Markdown notes application with LaTeX math support, perfect for capturing and organizing notes from ChatGPT and other sources.

## 🌐 Live Site

**URL:** [markdown.toontamilindia.in](https://markdown.toontamilindia.in)

## ✨ Features

### Core Features
- **📝 Markdown Editor** - Full Markdown support with live preview
- **🔢 Math Equations** - LaTeX math rendering via KaTeX (ChatGPT compatible)
- **💾 Auto-Save** - Notes are automatically saved to local storage
- **🔍 Search** - Quick search across all notes
- **📱 Responsive** - Works on desktop, tablet, and mobile

### Advanced Features
- **🔑 Master Key** - Use `ToonTamilIndia` to unlock editing for all notes
- **🏷️ Custom Aliases** - Create custom URL aliases for easy sharing
- **📋 Quick Paste** - Paste ChatGPT conversations directly
- **📤 Export** - Export all notes as JSON
- **🎨 Syntax Highlighting** - Code blocks with syntax highlighting
- **⌨️ Keyboard Shortcuts** - Efficient editing with shortcuts

## 🔧 Usage

### Creating Notes
1. Click **"+ New Note"** in the sidebar
2. Write your Markdown content in the editor
3. Notes auto-save as you type

### Math Equations
- **Inline math:** `$E = mc^2$` renders as inline equation
- **Block math:** 
  ```
  $$
  \int_{0}^{\infty} e^{-x^2} dx = \frac{\sqrt{\pi}}{2}
  $$
  ```

### Custom Aliases
1. Enter an alias in the "Custom alias" field
2. Access your note via `markdown.toontamilindia.in/#your-alias`

### Master Key Access
- Click **"🔑 Master Key"** in the sidebar
- Enter: `ToonTamilIndia`
- This grants full editing access to all notes

### Keyboard Shortcuts
| Shortcut | Action |
|----------|--------|
| `Ctrl/Cmd + S` | Save note |
| `Ctrl/Cmd + N` | New note |
| `Ctrl/Cmd + B` | Bold |
| `Ctrl/Cmd + I` | Italic |
| `Ctrl/Cmd + K` | Insert link |
| `Escape` | Close modals |

## 🚀 Deployment

### Option 1: Static Hosting (Recommended)

#### Netlify
1. Push to GitHub
2. Connect repo to Netlify
3. Set custom domain: `markdown.toontamilindia.in`

#### Vercel
1. Push to GitHub
2. Import project in Vercel
3. Set custom domain

#### GitHub Pages
1. Push to GitHub
2. Enable Pages in repo settings
3. Configure custom domain

### Option 2: Self-Hosting
Simply serve these files from any web server:
- `index.html`
- `styles.css`
- `app.js`
- `sw.js`
- `manifest.json`

### DNS Configuration
Add these DNS records for `markdown.toontamilindia.in`:
```
Type: CNAME
Name: markdown
Value: your-deployment-url
```

## 📁 File Structure

```
Markdown/
├── index.html      # Main HTML file
├── styles.css      # Styles
├── app.js          # Application logic
├── sw.js           # Service Worker (PWA)
├── manifest.json   # PWA manifest
└── README.md       # This file
```

## 🔒 Security Note

The master key (`ToonTamilIndia`) provides access to edit all notes stored in the browser's local storage. This is a client-side only application - all data is stored locally in the user's browser.

## 📄 License

Created for ToonTamilIndia. Free to use and modify.

---

Made with ❤️ for easy note-taking
