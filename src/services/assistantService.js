export function getAssistantResponse({
    question,
    location,
    weather,
    risk,
}) {
    const text = question.toLowerCase();

    if (
        text.includes("travel") ||
        text.includes("safe") ||
        text.includes("drive")
    ) {
        if (risk.level === "EXTREME" || risk.level === "HIGH") {
            return `Travel conditions in ${location} may be affected by the current ${risk.level.toLowerCase()} weather risk. Rainfall is around ${weather.rainfall} mm with a ${weather.rainProbability}% chance of rain. Consider avoiding unnecessary travel and monitor official weather alerts.`;
        }

        return `Current conditions in ${location} show a ${risk.level.toLowerCase()} weather risk. Rainfall is around ${weather.rainfall} mm with a ${weather.rainProbability}% chance of rain. Check local conditions before travelling.`;
    }

    if (
        text.includes("rain") ||
        text.includes("rainfall") ||
        text.includes("umbrella")
    ) {
        return `${location} currently has around ${weather.rainfall} mm of rainfall with a ${weather.rainProbability}% probability of rain. The current weather risk level is ${risk.level}.`;
    }

    if (
        text.includes("risk") ||
        text.includes("danger") ||
        text.includes("weather")
    ) {
        return `${location} currently has a ${risk.level} weather risk with a score of ${risk.score}/100. Main factors include: ${risk.factors.join(", ")}.`;
    }

    if (
        text.includes("wind") ||
        text.includes("storm")
    ) {
        return `The current wind speed in ${location} is approximately ${weather.windSpeed} km/h. The overall weather risk is ${risk.level} with a score of ${risk.score}/100.`;
    }

    if (
        text.includes("temperature") ||
        text.includes("hot") ||
        text.includes("cold")
    ) {
        return `The current temperature in ${location} is ${weather.temperature}°C. Humidity is ${weather.humidity}% and the current weather risk level is ${risk.level}.`;
    }

    return `For ${location}, the current weather risk is ${risk.level} with a score of ${risk.score}/100. Temperature is ${weather.temperature}°C, rainfall is ${weather.rainfall} mm, rain probability is ${weather.rainProbability}%, wind speed is ${weather.windSpeed} km/h, and humidity is ${weather.humidity}%.`;
}