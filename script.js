/* =============================================
   SkyCast — Weather App Logic
   ============================================= */

// ── Config ──────────────────────────────────
const API_KEY = 'ef2144f2c78f2febee9a5ee362e15a41'; // Replace with your OpenWeatherMap API key
const BASE_URL = 'https://api.openweathermap.org';

// ── DOM Elements ────────────────────────────
const $ = (sel) => document.querySelector(sel);
const searchInput = $('#searchInput');
const searchBtn = $('#searchBtn');
const locationBtn = $('#locationBtn');
const themeToggle = $('#themeToggle');
const loadingState = $('#loadingState');
const errorState = $('#errorState');
const errorMessage = $('#errorMessage');
const mainContent = $('#mainContent');

// ── State ───────────────────────────────────
let currentUnit = 'metric'; // metric = °C, imperial = °F
let currentWeatherData = null;
let currentAqiData = null;
let currentForecastDaily = null;
let aiEngine = null;
let isAiLoading = false;

// ── Init ────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  loadTheme();
  loadLastCity();
});

// ── Theme ───────────────────────────────────
function loadTheme() {
  const saved = localStorage.getItem('skycast-theme') || 'dark';
  document.documentElement.setAttribute('data-theme', saved);
}

function toggleTheme() {
  const html = document.documentElement;
  const current = html.getAttribute('data-theme');
  const next = current === 'dark' ? 'light' : 'dark';
  html.setAttribute('data-theme', next);
  localStorage.setItem('skycast-theme', next);
  
  if (typeof currentForecastDaily !== 'undefined' && currentForecastDaily) {
    renderForecastChart(currentForecastDaily);
  }
}

themeToggle.addEventListener('click', toggleTheme);

// ── Search ──────────────────────────────────
searchBtn.addEventListener('click', () => {
  const city = searchInput.value.trim();
  if (city) fetchAll(city);
});

searchInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    const city = searchInput.value.trim();
    if (city) fetchAll(city);
  }
});

// ── Geolocation ─────────────────────────────
locationBtn.addEventListener('click', () => {
  if (!navigator.geolocation) {
    showError('Geolocation is not supported by your browser.');
    return;
  }
  showLoading();
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      const { latitude, longitude } = pos.coords;
      fetchAllByCoords(latitude, longitude);
    },
    () => showError('Location access denied. Please search for a city instead.'),
    { timeout: 10000 }
  );
});

// ── Load last searched city ─────────────────
function loadLastCity() {
  const last = localStorage.getItem('skycast-last-city');
  if (last) {
    fetchAll(last);
  } else {
    // Try geolocation on first visit
    if (navigator.geolocation) {
      showLoading();
      navigator.geolocation.getCurrentPosition(
        (pos) => fetchAllByCoords(pos.coords.latitude, pos.coords.longitude),
        () => {
          // Default to a city
          fetchAll('New Delhi');
        },
        { timeout: 8000 }
      );
    } else {
      fetchAll('New Delhi');
    }
  }
}

// ── UI State Helpers ────────────────────────
function showLoading() {
  loadingState.classList.remove('hidden');
  errorState.classList.add('hidden');
  mainContent.classList.add('hidden');
}

function showError(msg) {
  loadingState.classList.add('hidden');
  errorState.classList.remove('hidden');
  mainContent.classList.add('hidden');
  errorMessage.textContent = msg;
}

function showMain() {
  loadingState.classList.add('hidden');
  errorState.classList.add('hidden');
  mainContent.classList.remove('hidden');
}

// ── Fetch All Data ──────────────────────────
async function fetchAll(city) {
  showLoading();
  try {
    const weatherData = await fetchWeather(city);
    const { lat, lon } = weatherData.coord;
    const [aqiData, forecastData, localArea] = await Promise.all([
      fetchAQI(lat, lon),
      fetchForecast(lat, lon),
      fetchLocalArea(lat, lon),
    ]);
    showMain();
    renderAll(weatherData, aqiData, forecastData, localArea);
    localStorage.setItem('skycast-last-city', city);
  } catch (err) {
    console.error(err);
    showError(err.message || 'Something went wrong. Try a different city.');
  }
}

async function fetchAllByCoords(lat, lon) {
  showLoading();
  try {
    const weatherData = await fetchWeatherByCoords(lat, lon);
    const [aqiData, forecastData, localArea] = await Promise.all([
      fetchAQI(lat, lon),
      fetchForecast(lat, lon),
      fetchLocalArea(lat, lon),
    ]);
    showMain();
    renderAll(weatherData, aqiData, forecastData, localArea);
    localStorage.setItem('skycast-last-city', weatherData.name);
  } catch (err) {
    console.error(err);
    showError(err.message || 'Something went wrong. Try searching for a city.');
  }
}

// ── API Calls ───────────────────────────────
async function fetchWeather(city) {
  const res = await fetch(
    `${BASE_URL}/data/2.5/weather?q=${encodeURIComponent(city)}&units=${currentUnit}&appid=${API_KEY}`
  );
  if (!res.ok) {
    if (res.status === 404) throw new Error('City not found. Please check the spelling and try again.');
    if (res.status === 401) throw new Error('Invalid API key. Please add your OpenWeatherMap API key in script.js.');
    throw new Error('Failed to fetch weather data.');
  }
  return res.json();
}

async function fetchWeatherByCoords(lat, lon) {
  const res = await fetch(
    `${BASE_URL}/data/2.5/weather?lat=${lat}&lon=${lon}&units=${currentUnit}&appid=${API_KEY}`
  );
  if (!res.ok) throw new Error('Failed to fetch weather data for your location.');
  return res.json();
}

async function fetchAQI(lat, lon) {
  try {
    const res = await fetch(
      `${BASE_URL}/data/2.5/air_pollution?lat=${lat}&lon=${lon}&appid=${API_KEY}`
    );
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

async function fetchForecast(lat, lon) {
  try {
    const res = await fetch(
      `${BASE_URL}/data/2.5/forecast?lat=${lat}&lon=${lon}&units=${currentUnit}&appid=${API_KEY}`
    );
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

async function fetchLocalArea(lat, lon) {
  try {
    const res = await fetch(
      `${BASE_URL}/geo/1.0/reverse?lat=${lat}&lon=${lon}&limit=1&appid=${API_KEY}`
    );
    if (!res.ok) return null;
    const data = await res.json();
    if (data && data.length > 0) {
      return {
        name: data[0].name,
        localNames: data[0].local_names || {},
        state: data[0].state || '',
        country: data[0].country || '',
      };
    }
    return null;
  } catch {
    return null;
  }
}

// ── Render All ──────────────────────────────
function renderAll(weather, aqi, forecast, localArea) {
  renderLocation(weather, localArea);
  renderWeather(weather);
  renderDetailChips(weather);
  renderAQI(aqi);
  renderForecast(forecast);
  updateBackground(weather);
  updateDateTime();
}

// ── Render Location ─────────────────────────
function renderLocation(weather, localArea) {
  const cityEl = $('#cityName');
  const areaEl = $('#localArea');

  const cityName = weather.name;
  const country = weather.sys?.country || '';

  cityEl.textContent = `${cityName}, ${country}`;

  if (localArea) {
    const parts = [];
    if (localArea.state && localArea.state !== cityName) {
      parts.push(localArea.state);
    }
    if (localArea.name && localArea.name !== cityName) {
      parts.push(localArea.name);
    }
    areaEl.textContent = parts.length > 0 ? parts.join(' • ') : `${cityName} Area`;
  } else {
    areaEl.textContent = '';
  }
}

// ── Render Weather ──────────────────────────
function renderWeather(data) {
  const unitSymbol = currentUnit === 'metric' ? 'C' : 'F';

  $('#temperature').textContent = Math.round(data.main.temp);
  $('#feelsLike').textContent = Math.round(data.main.feels_like);
  $('#weatherDesc').textContent = data.weather[0].description;
  $('#hiLo').textContent = `H: ${Math.round(data.main.temp_max)}° L: ${Math.round(data.main.temp_min)}°`;

  // Weather icon
  const iconCode = data.weather[0].icon;
  $('#weatherIcon').src = `https://openweathermap.org/img/wn/${iconCode}@4x.png`;
  $('#weatherIcon').alt = data.weather[0].description;
}

// ── Render Detail Chips ─────────────────────
function renderDetailChips(data) {
  $('#humidity').textContent = `${data.main.humidity}%`;

  const windSpeed = currentUnit === 'metric'
    ? `${(data.wind.speed * 3.6).toFixed(1)} km/h`   // m/s → km/h
    : `${data.wind.speed.toFixed(1)} mph`;
  $('#wind').textContent = windSpeed;

  // Rain chance (from rain volume if available)
  const rainVol = data.rain?.['1h'] || data.rain?.['3h'] || 0;
  const rainChance = rainVol > 0 ? Math.min(100, Math.round(rainVol * 20)) : (data.clouds?.all > 70 ? '~' + data.clouds.all : '0');
  $('#rainChance').textContent = typeof rainChance === 'number' ? `${rainChance}%` : `${rainChance}%`;

  const visKm = (data.visibility / 1000).toFixed(1);
  $('#visibility').textContent = `${visKm} km`;

  $('#pressure').textContent = `${data.main.pressure} hPa`;

  // Sunrise / Sunset
  const sunriseTime = new Date(data.sys.sunrise * 1000);
  const sunsetTime = new Date(data.sys.sunset * 1000);
  $('#sunrise').textContent = formatTime(sunriseTime);

  // Show sunset instead of sunrise at night
  const now = Date.now() / 1000;
  const chipSunrise = $('#chipSunrise');
  if (now > data.sys.sunset || now < data.sys.sunrise) {
    chipSunrise.querySelector('.chip-label').textContent = 'Sunset';
    chipSunrise.querySelector('.chip-value').textContent = formatTime(sunsetTime);
  } else {
    chipSunrise.querySelector('.chip-label').textContent = 'Sunrise';
    chipSunrise.querySelector('.chip-value').textContent = formatTime(sunriseTime);
  }
}

// ── Render AQI ──────────────────────────────
function renderAQI(aqiData) {
  const section = $('#aqiSection');
  if (!aqiData || !aqiData.list || aqiData.list.length === 0) {
    section.classList.add('hidden');
    return;
  }
  section.classList.remove('hidden');

  const info = aqiData.list[0];
  const aqiIndex = info.main.aqi; // 1-5 scale
  const components = info.components;

  // Map OWM AQI (1-5) to approximate US AQI values for display
  const aqiMap = {
    1: { value: 30, level: 'Good', class: 'good', pct: 6, advice: 'Air quality is excellent. Perfect for outdoor activities!' },
    2: { value: 70, level: 'Fair', class: 'fair', pct: 24, advice: 'Air quality is acceptable. Enjoy your day outside.' },
    3: { value: 120, level: 'Moderate', class: 'moderate', pct: 48, advice: 'Sensitive individuals should limit prolonged outdoor exertion.' },
    4: { value: 180, level: 'Poor', class: 'poor', pct: 72, advice: 'Reduce outdoor physical activity. Consider wearing a mask.' },
    5: { value: 350, level: 'Hazardous', class: 'hazardous', pct: 92, advice: 'Stay indoors! Air quality is dangerously unhealthy.' },
  };

  const mapped = aqiMap[aqiIndex] || aqiMap[1];

  $('#aqiValue').textContent = mapped.value;
  const levelEl = $('#aqiLevel');
  levelEl.textContent = mapped.level;
  levelEl.className = `aqi-level ${mapped.class}`;

  $('#aqiAdvice').textContent = mapped.advice;
  $('#aqiIndicator').style.left = `${mapped.pct}%`;

  // Pollutants
  $('#pm25').textContent = components.pm2_5?.toFixed(1) || '—';
  $('#pm10').textContent = components.pm10?.toFixed(1) || '—';
  $('#no2').textContent = components.no2?.toFixed(1) || '—';
  $('#o3').textContent = components.o3?.toFixed(1) || '—';
}

// ── Render 5-Day Forecast ───────────────────
function renderForecast(forecastData) {
  const strip = $('#forecastStrip');
  const section = $('#forecastSection');

  if (!forecastData || !forecastData.list) {
    section.classList.add('hidden');
    return;
  }
  section.classList.remove('hidden');
  strip.innerHTML = '';

  // Get one forecast per day (noon readings)
  const daily = [];
  const seen = new Set();

  for (const item of forecastData.list) {
    const date = new Date(item.dt * 1000);
    const dayKey = date.toDateString();

    // Skip today
    if (dayKey === new Date().toDateString()) continue;
    if (seen.has(dayKey)) continue;

    // Prefer the noon reading
    const hour = date.getHours();
    if (hour >= 11 && hour <= 15) {
      seen.add(dayKey);
      daily.push(item);
    }

    if (daily.length >= 5) break;
  }

  // Fallback: if we didn't get enough noon readings, grab first per day
  if (daily.length < 5) {
    daily.length = 0;
    seen.clear();
    for (const item of forecastData.list) {
      const dayKey = new Date(item.dt * 1000).toDateString();
      if (dayKey === new Date().toDateString()) continue;
      if (seen.has(dayKey)) continue;
      seen.add(dayKey);
      daily.push(item);
      if (daily.length >= 5) break;
    }
  }

  currentForecastDaily = daily;
  
  // Defer drawing slightly to ensure DOM layout has fully resolved after removing .hidden
  setTimeout(() => {
    if (currentForecastDaily) {
      renderForecastChart(currentForecastDaily);
    }
  }, 100);

  daily.forEach((item) => {
    const date = new Date(item.dt * 1000);
    const dayName = date.toLocaleDateString('en-US', { weekday: 'short' });
    const icon = item.weather[0].icon;
    const hi = Math.round(item.main.temp_max);
    const lo = Math.round(item.main.temp_min);

    const card = document.createElement('div');
    card.className = 'forecast-card';
    card.innerHTML = `
      <span class="forecast-day">${dayName}</span>
      <img class="forecast-icon" src="https://openweathermap.org/img/wn/${icon}@2x.png" alt="${item.weather[0].description}" />
      <span class="forecast-temp">${hi}°</span>
      <span class="forecast-temp-lo">${lo}°</span>
    `;
    strip.appendChild(card);
  });
}

// ── Render Forecast Graph ───────────────────
function renderForecastChart(dailyData) {
  const canvas = document.getElementById('forecastChart');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  ctx.scale(dpr, dpr);
  
  const width = rect.width;
  const height = rect.height;
  ctx.clearRect(0, 0, width, height);

  if (!dailyData || dailyData.length === 0) return;

  const padding = 30;
  const bottomPadding = 30; 
  const topPadding = 25;
  
  const temps = dailyData.map(d => Math.round(d.main.temp_max));
  const minTemp = Math.min(...temps) - 2;
  const maxTemp = Math.max(...temps) + 2;
  const tempRange = maxTemp - minTemp || 1;
  
  const stepX = (width - padding * 2) / (dailyData.length - 1 || 1);
  const primaryColor = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#818cf8';
  
  const points = dailyData.map((d, i) => {
    const t = Math.round(d.main.temp_max);
    return {
      x: padding + i * stepX,
      y: height - bottomPadding - ((t - minTemp) / tempRange) * (height - bottomPadding - topPadding),
      temp: t
    };
  });

  // Gradient fill
  const gradient = ctx.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, primaryColor);
  gradient.addColorStop(1, 'rgba(129, 140, 248, 0)');
  
  ctx.beginPath();
  ctx.moveTo(points[0].x, height - bottomPadding);
  points.forEach((p, i) => {
    if (i === 0) ctx.lineTo(p.x, p.y);
    else {
      const prev = points[i - 1];
      const cpX = (prev.x + p.x) / 2;
      ctx.bezierCurveTo(cpX, prev.y, cpX, p.y, p.x, p.y);
    }
  });
  ctx.lineTo(points[points.length - 1].x, height - bottomPadding);
  ctx.closePath();
  ctx.fillStyle = gradient;
  ctx.globalAlpha = 0.2;
  ctx.fill();
  
  // Line
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  points.forEach((p, i) => {
    if (i > 0) {
      const prev = points[i - 1];
      const cpX = (prev.x + p.x) / 2;
      ctx.bezierCurveTo(cpX, prev.y, cpX, p.y, p.x, p.y);
    }
  });
  ctx.strokeStyle = primaryColor;
  ctx.lineWidth = 3;
  ctx.globalAlpha = 1.0;
  ctx.stroke();
  
  // Points and text
  ctx.textAlign = 'center';
  const textColor = getComputedStyle(document.documentElement).getPropertyValue('--text-primary').trim() || '#fff';
  const cardBg = getComputedStyle(document.documentElement).getPropertyValue('--bg-card').trim() || '#1e1e2e';
  
  points.forEach(p => {
    ctx.beginPath();
    ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
    ctx.fillStyle = cardBg;
    ctx.fill();
    
    ctx.beginPath();
    ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
    ctx.strokeStyle = primaryColor;
    ctx.lineWidth = 2;
    ctx.stroke();
    
    ctx.fillStyle = textColor;
    ctx.font = '600 12px "Outfit", sans-serif';
    ctx.fillText(`${p.temp}°`, p.x, p.y - 12);
  });
}

window.addEventListener('resize', () => {
  if (currentForecastDaily) {
    renderForecastChart(currentForecastDaily);
  }
});

// ── Update Background ───────────────────────
function updateBackground(weather) {
  const body = document.body;
  const weatherId = weather.weather[0].id;
  const icon = weather.weather[0].icon;
  const isNight = icon.includes('n');

  // Remove all weather classes
  body.classList.remove('sunny', 'clear-night', 'cloudy', 'rainy', 'stormy', 'snowy', 'clear');

  let weatherType = 'clear';

  if (weatherId >= 200 && weatherId < 300) {
    body.classList.add('stormy');
    weatherType = 'storm';
  } else if (weatherId >= 300 && weatherId < 600) {
    body.classList.add('rainy');
    weatherType = 'rain';
  } else if (weatherId >= 600 && weatherId < 700) {
    body.classList.add('snowy');
    weatherType = 'snow';
  } else if (weatherId >= 700 && weatherId < 800) {
    body.classList.add('cloudy');
    weatherType = 'clouds';
  } else if (weatherId === 800) {
    body.classList.add(isNight ? 'clear-night' : 'sunny');
    weatherType = isNight ? 'night' : 'sunny';
  } else if (weatherId > 800) {
    body.classList.add('cloudy');
    weatherType = 'clouds';
  }

  // Start canvas animation
  startWeatherAnimation(weatherType, isNight);
}

// ── Update Date/Time ────────────────────────
function updateDateTime() {
  const now = new Date();
  const options = { weekday: 'long', month: 'short', day: 'numeric' };
  const dateStr = now.toLocaleDateString('en-US', options);
  const timeStr = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  $('#dateTime').textContent = `${dateStr} • ${timeStr}`;
}

setInterval(updateDateTime, 60000);

// ── Utilities ───────────────────────────────
function formatTime(date) {
  return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
}

// ══════════════════════════════════════════════
// ── PHASE 2: Weather Canvas Animations ──────
// ══════════════════════════════════════════════

const canvas = document.getElementById('weatherCanvas');
const ctx = canvas.getContext('2d');
let animationId = null;
let particles = [];
let currentWeatherType = '';

function resizeCanvas() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

// ── Particle Classes ────────────────────────

class RainDrop {
  constructor() {
    this.reset();
  }
  reset() {
    this.x = Math.random() * canvas.width;
    this.y = Math.random() * -canvas.height;
    this.length = 15 + Math.random() * 25;
    this.speed = 8 + Math.random() * 7;
    this.thickness = 1 + Math.random() * 1.5;
    this.opacity = 0.15 + Math.random() * 0.3;
    this.wind = 2 + Math.random() * 2;
  }
  update() {
    this.y += this.speed;
    this.x += this.wind;
    if (this.y > canvas.height) this.reset();
    if (this.x > canvas.width + 20) {
      this.x = -20;
    }
  }
  draw() {
    ctx.beginPath();
    ctx.moveTo(this.x, this.y);
    ctx.lineTo(this.x + this.wind * 2, this.y + this.length);
    ctx.strokeStyle = `rgba(174, 194, 224, ${this.opacity})`;
    ctx.lineWidth = this.thickness;
    ctx.lineCap = 'round';
    ctx.stroke();
  }
}

class SnowFlake {
  constructor() {
    this.reset();
  }
  reset() {
    this.x = Math.random() * canvas.width;
    this.y = Math.random() * -canvas.height;
    this.radius = 1.5 + Math.random() * 3.5;
    this.speed = 0.8 + Math.random() * 1.5;
    this.opacity = 0.3 + Math.random() * 0.5;
    this.drift = (Math.random() - 0.5) * 1.5;
    this.wobble = Math.random() * Math.PI * 2;
    this.wobbleSpeed = 0.01 + Math.random() * 0.02;
  }
  update() {
    this.wobble += this.wobbleSpeed;
    this.y += this.speed;
    this.x += this.drift + Math.sin(this.wobble) * 0.5;
    if (this.y > canvas.height + 10) this.reset();
    if (this.x > canvas.width + 10) this.x = -10;
    if (this.x < -10) this.x = canvas.width + 10;
  }
  draw() {
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(255, 255, 255, ${this.opacity})`;
    ctx.fill();
  }
}

class CloudPuff {
  constructor() {
    this.reset(true);
  }
  reset(initial = false) {
    this.y = 30 + Math.random() * (canvas.height * 0.25);
    this.radius = 40 + Math.random() * 80;
    this.speed = 0.15 + Math.random() * 0.3;
    this.opacity = 0.04 + Math.random() * 0.08;
    if (initial) {
      this.x = Math.random() * canvas.width;
    } else {
      this.x = -this.radius * 2;
    }
  }
  update() {
    this.x += this.speed;
    if (this.x > canvas.width + this.radius * 2) this.reset();
  }
  draw() {
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(200, 210, 225, ${this.opacity})`;
    ctx.fill();
    // Second puff for depth
    ctx.beginPath();
    ctx.arc(this.x + this.radius * 0.5, this.y - this.radius * 0.2, this.radius * 0.7, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(200, 210, 225, ${this.opacity * 0.7})`;
    ctx.fill();
  }
}

class SunRay {
  constructor(index, total) {
    this.index = index;
    this.total = total;
    this.angle = (index / total) * Math.PI * 2;
    this.length = 80 + Math.random() * 120;
    this.baseOpacity = 0.02 + Math.random() * 0.04;
    this.pulse = Math.random() * Math.PI * 2;
    this.pulseSpeed = 0.008 + Math.random() * 0.012;
    this.width = 20 + Math.random() * 30;
  }
  update() {
    this.pulse += this.pulseSpeed;
  }
  draw() {
    const cx = canvas.width * 0.78;
    const cy = canvas.height * 0.12;
    const opacity = this.baseOpacity + Math.sin(this.pulse) * 0.015;
    const len = this.length + Math.sin(this.pulse) * 20;

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(this.angle);

    const gradient = ctx.createLinearGradient(0, 0, len, 0);
    gradient.addColorStop(0, `rgba(255, 220, 100, ${opacity * 2})`);
    gradient.addColorStop(1, `rgba(255, 220, 100, 0)`);

    ctx.beginPath();
    ctx.moveTo(0, -this.width / 2);
    ctx.lineTo(len, -2);
    ctx.lineTo(len, 2);
    ctx.lineTo(0, this.width / 2);
    ctx.closePath();
    ctx.fillStyle = gradient;
    ctx.fill();
    ctx.restore();
  }
}

class Star {
  constructor() {
    this.x = Math.random() * canvas.width;
    this.y = Math.random() * (canvas.height * 0.5);
    this.radius = 0.5 + Math.random() * 1.5;
    this.baseOpacity = 0.2 + Math.random() * 0.5;
    this.twinkle = Math.random() * Math.PI * 2;
    this.twinkleSpeed = 0.01 + Math.random() * 0.03;
  }
  update() {
    this.twinkle += this.twinkleSpeed;
  }
  draw() {
    const opacity = this.baseOpacity + Math.sin(this.twinkle) * 0.2;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(220, 230, 255, ${Math.max(0, opacity)})`;
    ctx.fill();
  }
}

// ── Lightning Flash ─────────────────────────
let lightningTimer = 0;
let lightningOpacity = 0;

function triggerLightning() {
  lightningOpacity = 0.3 + Math.random() * 0.2;
  setTimeout(() => { lightningOpacity = 0; }, 80);
  // Double flash
  setTimeout(() => {
    lightningOpacity = 0.15 + Math.random() * 0.1;
    setTimeout(() => { lightningOpacity = 0; }, 60);
  }, 150);
}

// ── Animation Controller ────────────────────
function startWeatherAnimation(weatherType, isNight) {
  if (currentWeatherType === weatherType) return;
  currentWeatherType = weatherType;

  // Cancel previous animation
  if (animationId) cancelAnimationFrame(animationId);
  particles = [];

  const count = Math.min(canvas.width, 1200);

  switch (weatherType) {
    case 'rain':
      for (let i = 0; i < Math.floor(count * 0.12); i++) particles.push(new RainDrop());
      for (let i = 0; i < 6; i++) particles.push(new CloudPuff());
      break;

    case 'storm':
      for (let i = 0; i < Math.floor(count * 0.18); i++) particles.push(new RainDrop());
      for (let i = 0; i < 8; i++) particles.push(new CloudPuff());
      lightningTimer = 0;
      break;

    case 'snow':
      for (let i = 0; i < Math.floor(count * 0.08); i++) particles.push(new SnowFlake());
      break;

    case 'clouds':
      for (let i = 0; i < 10; i++) particles.push(new CloudPuff());
      break;

    case 'sunny':
      for (let i = 0; i < 16; i++) particles.push(new SunRay(i, 16));
      break;

    case 'night':
      for (let i = 0; i < 60; i++) particles.push(new Star());
      break;

    default:
      break;
  }

  animate();
}

function animate() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Lightning flash overlay
  if (currentWeatherType === 'storm') {
    lightningTimer++;
    if (lightningTimer > 200 + Math.random() * 400) {
      triggerLightning();
      lightningTimer = 0;
    }
    if (lightningOpacity > 0) {
      ctx.fillStyle = `rgba(200, 200, 255, ${lightningOpacity})`;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
  }

  // Draw & update particles
  for (const p of particles) {
    p.update();
    p.draw();
  }

  animationId = requestAnimationFrame(animate);
}

// ── AQI Fog Overlay ─────────────────────────
function updateAQIOverlay(aqiIndex) {
  let overlay = document.getElementById('aqiFogOverlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'aqiFogOverlay';
    overlay.className = 'aqi-fog-overlay';
    document.body.appendChild(overlay);
  }

  // AQI 1-5 scale from OpenWeatherMap
  if (aqiIndex >= 4) {
    // Poor or Hazardous
    const intensity = aqiIndex === 5 ? 0.25 : 0.12;
    overlay.style.opacity = intensity;
    overlay.classList.add('active');
  } else {
    overlay.style.opacity = 0;
    overlay.classList.remove('active');
  }
}

// Patch renderAll to include AQI overlay and Auto-Theme calculation
const _originalRenderAll = renderAll;
renderAll = function(weather, aqi, forecast, localArea) {
  _originalRenderAll(weather, aqi, forecast, localArea);
  
  if (aqi && aqi.list && aqi.list.length > 0) {
    updateAQIOverlay(aqi.list[0].main.aqi);
    currentAqiData = aqi; // Save for AI
  } else {
    updateAQIOverlay(0);
    currentAqiData = null;
  }
  
  currentWeatherData = weather; // Save for AI
  
  // Auto Theme Switching
  updateAutoTheme(weather);
};


// ══════════════════════════════════════════════
// ── PHASE 3: Signature Features ─────────────
// ══════════════════════════════════════════════

// ── Auto Day/Night Theme ──────────────────────
function updateAutoTheme(weather) {
  if (!weather || !weather.sys || !weather.timezone) return;
  
  // Calculate local time of the searched city
  const localTime = new Date(new Date().getTime() + (weather.timezone * 1000) + (new Date().getTimezoneOffset() * 60000));
  const hour = localTime.getHours();
  
  // Day is roughly 6 AM to 6 PM (18:00)
  const isDay = hour >= 6 && hour < 18;
  
  if (isDay) {
    document.documentElement.setAttribute('data-theme', 'light');
    localStorage.setItem('skycast-theme', 'light');
  } else {
    document.documentElement.setAttribute('data-theme', 'dark');
    localStorage.setItem('skycast-theme', 'dark');
  }
}

// ── 3D Anti-Gravity Card Parallax ───────────
const cards3D = document.querySelectorAll('.card-3d');

cards3D.forEach(card => {
  card.addEventListener('mousemove', (e) => {
    // Paralyze the auto-float on the hero card so it doesn't fight the mouse
    if (card.classList.contains('weather-hero')) {
      card.classList.add('parallax-active');
    }

    const rect = card.getBoundingClientRect();
    const x = e.clientX - rect.left; // x position within the element
    const y = e.clientY - rect.top;  // y position within the element
    
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;
    
    // Calculate rotation limits (max 10 degrees)
    const rotateX = ((y - centerY) / centerY) * -10;
    const rotateY = ((x - centerX) / centerX) * 10;
    
    // Dynamic shadow corresponding to tilt
    const shadowX = ((x - centerX) / centerX) * -15;
    const shadowY = ((y - centerY) / centerY) * -15;
    
    card.style.transform = `perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale3d(1.02, 1.02, 1.02)`;
    card.style.boxShadow = `${shadowX}px ${shadowY}px 30px rgba(0,0,0,0.15)`;
  });

  card.addEventListener('mouseleave', () => {
    // Reset
    if (card.classList.contains('weather-hero')) {
      card.classList.remove('parallax-active');
    }
    card.style.transform = `perspective(1000px) rotateX(0deg) rotateY(0deg) scale3d(1, 1, 1)`;
    card.style.boxShadow = '';
  });
});

// ── True Local AI (WebLLM) Weather Assistant ─────────

const aiChatBtn = document.getElementById('aiChatBtn');
const aiChatWindow = document.getElementById('aiChatWindow');
const aiChatClose = document.getElementById('aiChatClose');
const aiChatInput = document.getElementById('aiChatInput');
const aiChatSend = document.getElementById('aiChatSend');
const aiChatMessages = document.getElementById('aiChatMessages');
const aiProgressContainer = document.getElementById('aiProgressContainer');
const aiProgressText = document.getElementById('aiProgressText');
const aiProgressBar = document.getElementById('aiProgressBar');

// Initialize WebLLM Engine
async function initWebLLM() {
  if (aiEngine || isAiLoading) return;
  isAiLoading = true;
  
  aiProgressContainer.classList.remove('hidden');
  aiChatInput.disabled = true;
  aiChatSend.disabled = true;
  
  try {
    const { CreateMLCEngine } = await import("https://esm.run/@mlc-ai/web-llm");
    
    const initProgressCallback = (initProgress) => {
      aiProgressText.textContent = initProgress.text;
      const progressPercent = Math.round(initProgress.progress * 100);
      aiProgressBar.style.width = progressPercent + "%";
    };
    
    // Using a concise, highly capable fast-response instruct model supported by WebLLM
    const selectedModel = "Llama-3.2-1B-Instruct-q4f16_1-MLC"; 
    
    aiEngine = await CreateMLCEngine(selectedModel, { initProgressCallback });
    
    aiProgressContainer.classList.add('hidden');
    appendMessage("The powerful Llama 3 local AI is ready! It is running entirely on your device's GPU. What would you like to know about the weather?", "bot");
  } catch (error) {
    aiProgressText.textContent = "Error loading AI. Please ensure you have a WebGPU-enabled browser.";
    aiProgressBar.style.backgroundColor = "var(--aqi-hazardous)";
    console.error(error);
  } finally {
    isAiLoading = false;
    aiChatInput.disabled = false;
    aiChatSend.disabled = false;
    aiChatInput.focus();
  }
}

// Toggle Chat Window
aiChatBtn.addEventListener('click', () => {
  aiChatWindow.classList.toggle('hidden');
  if (!aiChatWindow.classList.contains('hidden')) {
    aiChatInput.focus();
    // Start loading the model the first time chat is opened
    if (!aiEngine && !isAiLoading) {
      initWebLLM();
    }
  }
});

aiChatClose.addEventListener('click', () => {
  aiChatWindow.classList.add('hidden');
});

// Append Message to Chat
function appendMessage(text, sender) {
  const msgDiv = document.createElement('div');
  msgDiv.className = `ai-msg ${sender}`;
  msgDiv.textContent = text;
  aiChatMessages.appendChild(msgDiv);
  aiChatMessages.scrollTop = aiChatMessages.scrollHeight;
  return msgDiv;
}

// Handle AI inference
async function handleAISend() {
  if (!aiEngine) {
    appendMessage("Please wait for the AI to finish loading...", "bot");
    return;
  }

  const query = aiChatInput.value.trim();
  if (!query) return;

  // Show User Message
  appendMessage(query, 'user');
  aiChatInput.value = '';

  aiChatInput.disabled = true;
  aiChatSend.disabled = true;

  // Sync the exact UI AQI string
  let aqiDisplayValue = 'Unknown';
  if (currentAqiData && currentAqiData.list.length > 0) {
    const rawIndex = currentAqiData.list[0].main.aqi;
    const aqiMap = {
      1: { value: 30, text: 'Good' },
      2: { value: 70, text: 'Fair' },
      3: { value: 120, text: 'Moderate' },
      4: { value: 180, text: 'Poor' },
      5: { value: 350, text: 'Hazardous' },
    };
    const mapped = aqiMap[rawIndex] || aqiMap[1];
    aqiDisplayValue = `${mapped.value} AQI (${mapped.text})`;
  }

  // Build Context dynamically
  const contextStr = currentWeatherData ? `Current Location: ${currentWeatherData.name}
Temperature: ${Math.round(currentWeatherData.main.temp)}°C
Feels Like: ${Math.round(currentWeatherData.main.feels_like)}°C
Condition: ${currentWeatherData.weather[0].description}
Wind: ${currentWeatherData.wind.speed} m/s
Air Quality: ${aqiDisplayValue}` : "No weather data loaded yet. Tell the user to search for a city.";

  const systemPrompt = `You are SkyCast AI, a highly advanced but friendly weather assistant running locally in the user's browser.
Your goal is to provide concise, practical advice based on the user's question and the real-time weather data below.
- NEVER invent or hallucinate weather data. Rely ONLY on the provided context.
- Keep your answers short (1-3 sentences maximum).
- Be direct and conversational.

--- Context Data ---
${contextStr}`;

  try {
    const messages = [
      { role: "system", content: systemPrompt },
      { role: "user", content: query }
    ];
    
    // Create an empty bot message for streaming
    const msgDiv = appendMessage("", "bot");
    
    const chunks = await aiEngine.chat.completions.create({
      messages,
      temperature: 0.6,
      stream: true
    });
    
    let reply = "";
    for await (const chunk of chunks) {
      reply += chunk.choices[0]?.delta?.content || "";
      msgDiv.textContent = reply;
      aiChatMessages.scrollTop = aiChatMessages.scrollHeight;
    }
  } catch (error) {
    appendMessage("Sorry, I encountered a local inference error. Check console.", "bot");
    console.error(error);
  } finally {
    aiChatInput.disabled = false;
    aiChatSend.disabled = false;
    aiChatInput.focus();
  }
}

aiChatSend.addEventListener('click', handleAISend);
aiChatInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') handleAISend();
});
