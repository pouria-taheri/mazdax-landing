# Mazdax Landing Page

Simple RTL Persian landing page for a Mazdax campaign. The page includes a registration form, countdown, FAQ accordion, ticker animation, and a logo image.

## Project Structure

```text
landing/
  public_html/
    index.html
    register.php
    css/
      style.css
    js/
      main.js
    images/
      mazdax-horizontal-dark-fa.png
```

## Files

- `public_html/index.html`: Main landing page markup.
- `public_html/css/style.css`: All page styles.
- `public_html/js/main.js`: Form handling, FAQ toggle, countdown, and ticker animation.
- `public_html/register.php`: Backend endpoint for registration form submissions.
- `public_html/images/mazdax-horizontal-dark-fa.png`: Header logo image.

## Run With XAMPP

XAMPP usually serves files from:

```text
C:\xampp\htdocs
```

To view this project in XAMPP, copy the contents of `public_html` into a folder such as:

```text
C:\xampp\htdocs\landing
```

Then open:

```text
http://localhost/landing/
```

If changes do not appear, make sure you are editing the same folder that XAMPP is serving. Also try a hard refresh in the browser:

```text
Ctrl + F5
```

## Notes

- The page uses external CSS and JavaScript files.
- The registration form sends a POST request to `/register.php`.
- If the project is inside `C:\xampp\htdocs\landing`, the form endpoint should resolve as `http://localhost/register.php` only when the site is served from the web root. If served from `/landing/`, update the fetch path in `main.js` if needed.
