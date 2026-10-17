Copy this "astra" folder to: ~/Desktop/astra-frontend/src/components/astra
Then render it, e.g. in src/App.jsx:
  import AstraDashboard from './components/astra/AstraDashboard.jsx'
  export default function App(){ return <AstraDashboard/> }
Requires (already in your project): react, lucide-react, leaflet, react-leaflet, tailwindcss v4.
Make sure your index.css has: @import "tailwindcss";
