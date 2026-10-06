const fs = require('fs');

const path = 'server.js';
let text = fs.readFileSync(path, 'utf8');

const helper = String.raw`
function looksLikeWeatherQuestion(message) {
  return /weather|temperature|forecast|rain|snow|\u5929\u6c14|\u6c14\u6e29|\u6e29\u5ea6|\u4e0b\u96e8|\u4e0b\u96ea|\u964d\u96e8|\u964d\u96ea/i.test(
    String(message || "")
  );
}

function inferWeatherLocation(message, user) {
  const text = (String(message || "") + " " + String((user && user.profile && user.profile.school) || "")).toLowerCase();
  const locations = [
    ["Toronto", ["toronto", "\u591a\u4f26\u591a", "university of toronto", "centennial", "seneca", "george brown", "york university", "toronto metropolitan"]],
    ["Vancouver", ["vancouver", "\u6e29\u54e5\u534e", "ubc", "university of british columbia"]],
    ["Montreal", ["montreal", "\u8499\u7279\u5229\u5c14", "mcgill", "concordia"]],
    ["Waterloo", ["waterloo", "\u6ed1\u94c1\u5362"]],
    ["Hamilton", ["hamilton", "mcmaster"]],
    ["London Ontario", ["western university", "london ontario"]],
    ["Kingston Ontario", ["queen's university", "queens university", "kingston"]],
    ["Ottawa", ["ottawa", "\u6e25\u592a\u534e", "carleton"]],
    ["Calgary", ["calgary", "\u5361\u5c14\u52a0\u91cc"]],
    ["Edmonton", ["edmonton", "\u57c3\u5fb7\u8499\u987f", "university of alberta"]],
    ["New York", ["new york", "nyu", "columbia university", "\u7ebd\u7ea6"]],
    ["Boston", ["boston", "harvard", "mit", "northeastern", "boston university", "\u6ce2\u58eb\u987f"]],
    ["Los Angeles", ["los angeles", "ucla", "usc", "\u6d1b\u6749\u77f6"]],
    ["San Francisco", ["san francisco", "stanford", "berkeley", "\u65e7\u91d1\u5c71"]],
    ["Seattle", ["seattle", "university of washington", "\u897f\u96c5\u56fe"]],
    ["Chicago", ["chicago", "uchicago", "northwestern", "\u829d\u52a0\u54e5"]]
  ];
  const match = locations.find(function(row) {
    return row[1].some(function(key) { return text.includes(key); });
  });
  return match ? match[0] : "Toronto";
}

function weatherCodeLabel(code) {
  const labels = {
    0: "Clear sky",
    1: "Mainly clear",
    2: "Partly cloudy",
    3: "Overcast",
    45: "Fog",
    48: "Depositing rime fog",
    51: "Light drizzle",
    53: "Moderate drizzle",
    55: "Dense drizzle",
    61: "Slight rain",
    63: "Moderate rain",
    65: "Heavy rain",
    71: "Slight snow",
    73: "Moderate snow",
    75: "Heavy snow",
    80: "Slight rain showers",
    81: "Moderate rain showers",
    82: "Violent rain showers",
    95: "Thunderstorm"
  };
  return labels[Number(code)] || "Weather code " + code;
}

async function fetchJsonWithTimeout(url, timeoutMs = 6500) {
  const controller = new AbortController();
  const timer = setTimeout(function() { controller.abort(); }, timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) throw new Error("Weather API returned " + response.status);
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

async function getWeatherContextForQuestion(message, user) {
  if (!looksLikeWeatherQuestion(message)) return "";
  const location = inferWeatherLocation(message, user);
  try {
    const geoUrl = "https://geocoding-api.open-meteo.com/v1/search?name=" + encodeURIComponent(location) + "&count=1&language=en&format=json";
    const geo = await fetchJsonWithTimeout(geoUrl);
    const place = geo && geo.results && geo.results[0];
    if (!place) return "Weather lookup could not find coordinates for " + location + ".";
    const forecastUrl =
      "https://api.open-meteo.com/v1/forecast?latitude=" + place.latitude + "&longitude=" + place.longitude +
      "&current=temperature_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m" +
      "&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum" +
      "&forecast_days=1&timezone=auto";
    const forecast = await fetchJsonWithTimeout(forecastUrl);
    const current = forecast.current || {};
    const daily = forecast.daily || {};
    const placeLabel = place.name + (place.admin1 ? ", " + place.admin1 : "") + (place.country ? ", " + place.country : "");
    return [
      "Real-time weather lookup for " + placeLabel + ".",
      "Current condition: " + weatherCodeLabel(current.weather_code) + ".",
      "Current temperature: " + current.temperature_2m + (forecast.current_units && forecast.current_units.temperature_2m ? forecast.current_units.temperature_2m : "C") + ".",
      "Feels like: " + current.apparent_temperature + (forecast.current_units && forecast.current_units.apparent_temperature ? forecast.current_units.apparent_temperature : "C") + ".",
      "Wind speed: " + current.wind_speed_10m + (forecast.current_units && forecast.current_units.wind_speed_10m ? forecast.current_units.wind_speed_10m : "km/h") + ".",
      "Today's high/low: " + ((daily.temperature_2m_max || [])[0]) + (forecast.daily_units && forecast.daily_units.temperature_2m_max ? forecast.daily_units.temperature_2m_max : "C") + " / " + ((daily.temperature_2m_min || [])[0]) + (forecast.daily_units && forecast.daily_units.temperature_2m_min ? forecast.daily_units.temperature_2m_min : "C") + ".",
      "Today's precipitation: " + ((daily.precipitation_sum || [])[0]) + (forecast.daily_units && forecast.daily_units.precipitation_sum ? forecast.daily_units.precipitation_sum : "mm") + ".",
      "Weather data time: " + (current.time || "unknown") + "."
    ].join("\n");
  } catch (error) {
    return "Weather lookup failed: " + ((error && error.message) || "unknown error") + ". Tell the student the live weather service is temporarily unavailable.";
  }
}
`;

if (!text.includes('function getWeatherContextForQuestion')) {
  const marker = '\n\nfunction buildStudyPrompt';
  if (!text.includes(marker)) throw new Error('buildStudyPrompt marker was not found');
  text = text.replace(marker, '\n' + helper + '\nfunction buildStudyPrompt');
}

text = text.replace(
  'function buildStudyPrompt({ user, course, documents, history, scheduleItems, mode, message })',
  'function buildStudyPrompt({ user, course, documents, history, scheduleItems, weatherContext, mode, message })'
);
text = text.replace(
  "keep answers grounded in the provided course material and the student's global schedule.",
  "keep answers grounded in the provided course material, the student's global schedule, and any real-time external context provided by the server."
);
text = text.replace(
  'even if the current chat is inside a different course."',
  'even if the current chat is inside a different course. When real-time weather context is provided, answer the weather question directly and include practical clothing/commute advice."'
);
text = text.replace(
  'Current server time: ${new Date().toISOString()}\\n\\nGlobal unfinished schedule/deadline items across this student\'s account:',
  'Current server time: ${new Date().toISOString()}\\n\\nReal-time external context:\\n${weatherContext || "No external context was needed or available for this question."}\\n\\nGlobal unfinished schedule/deadline items across this student\'s account:'
);
text = text.replace(
  /const \[documents, history, scheduleItems\] = await Promise\.all\(\[\s*db\.listDocuments\(user\.id, courseId\),\s*db\.listMessages\(user\.id, courseId\),\s*(?:db\.)?listUserScheduleItems\(user\.id\)\s*\]\);/s,
  'const [documents, history, scheduleItems, weatherContext] = await Promise.all([\n        db.listDocuments(user.id, courseId),\n        db.listMessages(user.id, courseId),\n        listUserScheduleItems(user.id),\n        getWeatherContextForQuestion(message, user)\n      ]);'
);
text = text.replace(
  'buildStudyPrompt({ user, course, documents, history, scheduleItems, mode, message })',
  'buildStudyPrompt({ user, course, documents, history, scheduleItems, weatherContext, mode, message })'
);

fs.writeFileSync(path, text, 'utf8');
console.log('weather patch applied');
