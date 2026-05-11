# Flutter Wave Generator 🌊

A visual, interactive web tool designed to help Flutter developers easily generate complex `CustomClipper` paths for wave shapes.

## Features
- **Interactive Canvas**: Drag and drop control points to visually design your wave.
- **Auto-Smooth Math**: A "Fix Smoothness" feature that perfectly aligns your anchor points for beautiful, C1 continuous quadratic bezier curves.
- **Dynamic Dart Code Generation**: Instantly gives you the exact `quadraticBezierTo` code with relative percentages based on `size.width` and `size.height`.
- **Add/Remove Waves**: Easily chain multiple bezier curves together to make complex shapes.

## How to Use
1. Open the website.
2. Drag the **Blue dots** (Control points) to where you want the peaks and valleys of your wave to be.
3. Click the **"✨ Fix Smoothness"** button to automatically calculate the perfect math for a smooth curve.
4. Click **Copy Code** and paste it directly into your Flutter `CustomClipper` class!

## Tech Stack
- Vanilla HTML5
- Vanilla CSS3 (Custom Dark Theme & Glassmorphism)
- Vanilla JavaScript (SVG manipulation & Math generation)

## Contributing
Feel free to fork this project, submit PRs, or open issues if you find any bugs or have feature requests!
