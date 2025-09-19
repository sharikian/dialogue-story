/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx,html}"
  ],
  theme: {
    extend: {
      // preserve original visual sizes (you can tune these later)
      spacing: {
        '7': '28px'
      },
      boxShadow: {
        'dialog': '0 10px 30px rgba(0,0,0,0.35)',
        'dialog-strong': '0 12px 36px rgba(0,0,0,0.6)',
        'avatar': '0 6px 16px rgba(0,0,0,0.35)',
        'avatar-strong': '0 20px 60px rgba(0,0,0,0.6)'
      }
    }
  },
  plugins: []
};
