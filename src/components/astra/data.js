// DEMO DATA ONLY — replace with service/API data later.
export const RISK_COLORS = { Low:'#4ade80', Moderate:'#fbbf24', High:'#fb923c', Extreme:'#ef4444' }
export const levelFor = (s) => (s < 25 ? 'Low' : s < 50 ? 'Moderate' : s < 75 ? 'High' : 'Extreme')
export const LEVEL_TEXT = {
  Low:'Conditions are calm. Routine awareness is enough.',
  Moderate:'Some hazardous conditions possible. Stay informed.',
  High:'Significant weather risk. Prepare and limit travel.',
  Extreme:'Severe risk. Follow official guidance closely.',
}
export const FACTOR_WEIGHTS = [
  { key:'rainfall', label:'Rainfall', weight:40 },
  { key:'rainProb', label:'Rain probability', weight:30 },
  { key:'wind', label:'Wind speed', weight:20 },
  { key:'humidity', label:'Humidity', weight:10 },
]
export const LOCATIONS = {
  Ghaziabad:{ lat:28.6692, lng:77.4538, temp:31, rain:35, wind:14, hum:58, score:34, summary:'Partly cloudy, light breeze', factors:{ rainfall:30, rainProb:35, wind:28, humidity:58 } },
  Delhi:    { lat:28.6139, lng:77.2090, temp:33, rain:20, wind:11, hum:46, score:18, summary:'Hazy sun, dry air',          factors:{ rainfall:10, rainProb:20, wind:22, humidity:46 } },
  Noida:    { lat:28.5355, lng:77.3910, temp:32, rain:55, wind:18, hum:64, score:52, summary:'Overcast, showers likely',   factors:{ rainfall:48, rainProb:55, wind:36, humidity:64 } },
  Agra:     { lat:27.1767, lng:78.0081, temp:36, rain:72, wind:26, hum:71, score:81, summary:'Thunderstorm build-up',      factors:{ rainfall:84, rainProb:72, wind:52, humidity:71 } },
}
export const SAMPLE_ALERTS = [
  { id:1, severity:'High',     title:'Heavy rainfall advisory', text:'Intense showers possible this evening. Avoid low-lying roads.', time:'Sample · 2h ago' },
  { id:2, severity:'Moderate', title:'Gusty winds expected',    text:'Wind gusts may disrupt light structures and outdoor events.',   time:'Sample · 5h ago' },
  { id:3, severity:'Low',      title:'High humidity',           text:'Muggy conditions through the afternoon. Stay hydrated.',        time:'Sample · 8h ago' },
]
