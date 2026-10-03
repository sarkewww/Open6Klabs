/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        "spotify-black": "#191414",
        ink: "#0a0a0a",
        card: "#121212",
        line: "#232323",
        accent: "#1db954",
      },
      fontFamily: {
        integral: ["Poppins", "sans-serif"],
        poppins: ["Poppins", "sans-serif"],
      },
    },
  },
  plugins: [],
};
