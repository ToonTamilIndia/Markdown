# Welcome to Markdown Notes! 

This is a sample note demonstrating the features of your Markdown Notes app.

## Features

### Text Formatting
- **Bold text**using `**text**`
- *Italic text* using `*text*`
- ~~Strikethrough~~ using `~~text~~`
- `inline code` using backticks

### Code Blocks

```javascript
function greet(name) {
    return `Hello, ${name}!`;
}
console.log(greet('ToonTamilIndia'));
```

```python
def fibonacci(n):
    if n <= 1:
        return n
    return fibonacci(n-1) + fibonacci(n-2)
```

### Math Equations (LaTeX)

Inline math: $E = mc^2$

The quadratic formula: $x = \frac{-b \pm \sqrt{b^2 - 4ac}}{2a}$

Block equations:

$$
\int_{-\infty}^{\infty} e^{-x^2} dx = \sqrt{\pi}
$$

$$
\sum_{n=1}^{\infty} \frac{1}{n^2} = \frac{\pi^2}{6}
$$

### Lists

#### Unordered
- Item 1
- Item 2
  - Nested item
  - Another nested

#### Ordered
1. First step
2. Second step
3. Third step

### Tables

| Feature | Status |
|---------|--------|
| Markdown |  |
| Math (LaTeX) |  |
| Code Highlighting |  |
| Auto-save |  |
| Custom Aliases |  |

### Blockquotes

> "The best way to predict the future is to invent it."
> — Alan Kay

### Links & Images

[Visit ToonTamilIndia](https://toontamilindia.in)

---

## Master Key

Configure `MASTER_KEY` as a Cloudflare secret, then enter that value in the Master Key dialog to manage server-side shared notes.

## Custom Aliases

Set a custom alias (like `welcome`) to share notes via:
`markdown.toontamilindia.in/#welcome`

---

*Happy note-taking!* 
