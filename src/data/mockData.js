export const mockWeatherData = {
  Ghaziabad: {
    location: "Ghaziabad",
    temperature: 29,
    rainfall: 42,
    rainProbability: 80,
    windSpeed: 18,
    humidity: 75,
  },

  Delhi: {
    location: "Delhi",
    temperature: 31,
    rainfall: 35,
    rainProbability: 70,
    windSpeed: 16,
    humidity: 68,
  },

  Noida: {
    location: "Noida",
    temperature: 30,
    rainfall: 48,
    rainProbability: 82,
    windSpeed: 20,
    humidity: 72,
  },

  Agra: {
    location: "Agra",
    temperature: 32,
    rainfall: 25,
    rainProbability: 55,
    windSpeed: 14,
    humidity: 61,
  },
};

export const mockRiskData = {
  Ghaziabad: {
    score: 78,
    level: "HIGH",
    factors: [
      "Heavy rainfall",
      "High precipitation probability",
    ],
  },

  Delhi: {
    score: 64,
    level: "MODERATE",
    factors: [
      "Moderate rainfall",
      "High humidity",
    ],
  },

  Noida: {
    score: 82,
    level: "HIGH",
    factors: [
      "Heavy rainfall",
      "Strong precipitation probability",
      "High wind speed",
    ],
  },

  Agra: {
    score: 42,
    level: "MODERATE",
    factors: [
      "Moderate precipitation probability",
      "Elevated temperature",
    ],
  },
};

export const alertData = {
  title: "Heavy Rain Expected",
  message:
    "Heavy rainfall may affect local travel and low-lying areas.",
  recommendation:
    "Avoid unnecessary travel and monitor local weather updates.",
};