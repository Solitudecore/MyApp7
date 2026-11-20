import React, { useEffect, useState } from "react";

import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Image,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  StatusBar,
  Keyboard,
} from "react-native";

import * as Location from "expo-location";

import AsyncStorage from "@react-native-async-storage/async-storage";

const API_KEY = process.env.EXPO_PUBLIC_OPENWEATHER_API_KEY;

const STORAGE_KEY = "last_weather";

type WeatherData = {
  city: string;
  country: string;
  temperature: number;
  feelsLike: number;
  humidity: number;
  description: string;
  icon: string;
  condition: string;
  windSpeed: number;
  savedAt: string;
};

type WeatherResponse = {
  name: string;
  sys?: {
    country?: string;
  };
  main: {
    temp: number;
    feels_like: number;
    humidity: number;
  };
  weather: {
    main: string;
    description: string;
    icon: string;
  }[];
  wind?: {
    speed?: number;
  };
  message?: string;
};

type GeoLocation = {
  name: string;
  lat: number;
  lon: number;
  country: string;
};

const getWeatherByCoordinates = async (
  latitude: number,
  longitude: number,
): Promise<WeatherData> => {
  const url = `https://api.openweathermap.org/data/2.5/weather?lat=${latitude}&lon=${longitude}&appid=${API_KEY}&units=metric&lang=en`;

  const response = await fetch(url);

  const data = (await response.json()) as WeatherResponse;

  if (!response.ok) {
    throw new Error(data.message || "Weather information not found");
  }

  const weatherInfo = data.weather?.[0];

  if (!weatherInfo) {
    throw new Error("Weather information not available");
  }

  return {
    city: data.name,
    country: data.sys?.country ?? "",
    temperature: data.main.temp,
    feelsLike: data.main.feels_like,
    humidity: data.main.humidity,
    description: weatherInfo.description,
    icon: weatherInfo.icon,
    condition: weatherInfo.main,
    windSpeed: data.wind?.speed ?? 0,
    savedAt: new Date().toISOString(),
  };
};

const getWeatherByCity = async (city: string): Promise<WeatherData> => {
  const url = `https://api.openweathermap.org/geo/1.0/direct?q=${encodeURIComponent(city)}&limit=1&appid=${API_KEY}`;

  const response = await fetch(url);

  const result: unknown = await response.json();

  if (!response.ok) {
    throw new Error("City search failed");
  }

  if (!Array.isArray(result) || result.length === 0) {
    throw new Error("City not found");
  }

  const location = result[0] as GeoLocation;

  return getWeatherByCoordinates(location.lat, location.lon);
};

const getWeatherEmoji = (condition: string): string => {
  switch (condition.toLowerCase()) {
    case "clear":
      return "☀️";

    case "clouds":
      return "☁️";

    case "rain":
    case "drizzle":
      return "🌧️";

    case "snow":
      return "❄️";

    case "thunderstorm":
      return "⛈️";

    case "mist":
    case "fog":
    case "haze":
      return "🌫️";

    default:
      return "🌤️";
  }
};

export default function HomeScreen() {
  const [weather, setWeather] = useState<WeatherData | null>(null);

  const [city, setCity] = useState("");

  const [loading, setLoading] = useState(true);

  const [searching, setSearching] = useState(false);

  const [error, setError] = useState("");

  const [offline, setOffline] = useState(false);

  const [iconError, setIconError] = useState(false);

  useEffect(() => {
    loadInitialWeather();
  }, []);

  const loadCache = async (): Promise<boolean> => {
    try {
      const savedData = await AsyncStorage.getItem(STORAGE_KEY);

      if (savedData) {
        const parsedData = JSON.parse(savedData) as WeatherData;

        setWeather(parsedData);

        return true;
      }

      return false;
    } catch (error) {
      console.log("Cache error:", error);

      return false;
    }
  };

  const saveCache = async (data: WeatherData) => {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  };

  const loadInitialWeather = async () => {
    setLoading(true);

    setError("");

    const hasCache = await loadCache();

    try {
      if (!API_KEY) {
        throw new Error("API Key not found");
      }

      const permission = await Location.requestForegroundPermissionsAsync();

      let newWeather: WeatherData;

      if (permission.status === "granted") {
        try {
          const position = await Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.Balanced,
          });

          newWeather = await getWeatherByCoordinates(
            position.coords.latitude,
            position.coords.longitude,
          );
        } catch (locationError) {
          console.log("Location error:", locationError);

          newWeather = await getWeatherByCity("Baku");

          setError("Location unavailable. Showing Baku weather.");
        }
      } else {
        newWeather = await getWeatherByCity("Baku");

        setError("Location permission denied. Showing Baku weather.");
      }

      await saveCache(newWeather);

      setWeather(newWeather);

      setOffline(false);

      setIconError(false);
    } catch (err) {
      console.log("Weather error:", err);

      if (hasCache) {
        setOffline(true);

        setError(
          "Internet connection unavailable. Showing last saved weather.",
        );
      } else {
        setError(err instanceof Error ? err.message : "Something went wrong");
      }
    } finally {
      setLoading(false);
    }
  };

  const searchWeather = async () => {
    if (!city.trim()) {
      setError("Please enter a city name.");

      return;
    }

    Keyboard.dismiss();

    setSearching(true);

    setError("");

    try {
      const newWeather = await getWeatherByCity(city.trim());

      await saveCache(newWeather);

      setWeather(newWeather);

      setOffline(false);

      setIconError(false);

      setCity("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "City not found");
    } finally {
      setSearching(false);
    }
  };

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.container}
      keyboardShouldPersistTaps="handled"
    >
      <StatusBar barStyle="dark-content" />


      <View style={styles.header}>
        <Text style={styles.title}>Weather App</Text>

        <Text style={styles.subtitle}>Discover the weather in your city</Text>
      </View>


      <View style={styles.searchContainer}>
        <TextInput
          style={styles.input}
          placeholder="Enter city name..."
          placeholderTextColor="#999"
          value={city}
          onChangeText={setCity}
          onSubmitEditing={searchWeather}
          returnKeyType="search"
        />

        <TouchableOpacity
          style={styles.searchButton}
          onPress={searchWeather}
          disabled={searching}
        >
          <Text style={styles.searchButtonText}>
            {searching ? "..." : "Search"}
          </Text>
        </TouchableOpacity>
      </View>


      {(loading || searching) && (
        <ActivityIndicator size="large" color="#2878E5" style={styles.loader} />
      )}


      {error !== "" && (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}
 
      {weather && (
        <View style={styles.weatherCard}>
          <Text style={styles.cityName}>
            {weather.city}, {weather.country}
          </Text>

         
          {!iconError ? (
            <Image
              source={{
                uri: `https://openweathermap.org/img/wn/${weather.icon}@4x.png`,
              }}
              style={styles.weatherIcon}
              resizeMode="contain"
              onError={() => setIconError(true)}
            />
          ) : (
            <Text style={styles.weatherEmoji}>
              {getWeatherEmoji(weather.condition)}
            </Text>
          )}
 
          <Text style={styles.temperature}>
            {Math.round(weather.temperature)}°
          </Text>

          <Text style={styles.unit}>Celsius</Text>
 
          <Text style={styles.description}>{weather.description}</Text>
 
          <View style={styles.detailsContainer}>
            <View style={styles.detailBox}>
              <Text style={styles.detailIcon}>🌡️</Text>

              <Text style={styles.detailTitle}>Feels Like</Text>

              <Text style={styles.detailValue}>
                {Math.round(weather.feelsLike)}°C
              </Text>
            </View>

            <View style={styles.detailBox}>
              <Text style={styles.detailIcon}>💧</Text>

              <Text style={styles.detailTitle}>Humidity</Text>

              <Text style={styles.detailValue}>{weather.humidity}%</Text>
            </View>

            <View style={styles.detailBox}>
              <Text style={styles.detailIcon}>💨</Text>

              <Text style={styles.detailTitle}>Wind</Text>

              <Text style={styles.detailValue}>{weather.windSpeed} m/s</Text>
            </View>
          </View>
 
          <Text style={styles.updatedAt}>
            Last updated: {new Date(weather.savedAt).toLocaleString("az-AZ")}
          </Text>
 
          {offline && <Text style={styles.offlineText}>Offline Mode</Text>}
        </View>
      )}
 
      {!weather && !loading && (
        <Text style={styles.emptyText}>
          Weather information is not available.
        </Text>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#F3F7FF",
  },

  container: {
    flexGrow: 1,
    padding: 22,
    paddingTop: 60,
  },

  header: {
    marginBottom: 30,
  },

  title: {
    fontSize: 30,
    fontWeight: "bold",
    color: "#172B4D",
  },

  subtitle: {
    fontSize: 15,
    color: "#8793A8",
    marginTop: 7,
  },

  searchContainer: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 25,
  },

  input: {
    flex: 1,
    height: 52,
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    paddingHorizontal: 15,
    fontSize: 15,
    color: "#172B4D",
  },

  searchButton: {
    backgroundColor: "#2878E5",
    paddingHorizontal: 20,
    justifyContent: "center",
    alignItems: "center",
    borderRadius: 14,
  },

  searchButtonText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "bold",
  },

  loader: {
    marginVertical: 25,
  },

  errorContainer: {
    backgroundColor: "#FFF0F0",
    padding: 13,
    borderRadius: 12,
    marginBottom: 15,
  },

  errorText: {
    color: "#D64545",
    fontSize: 13,
  },

  weatherCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 25,
    padding: 22,
    alignItems: "center",
    elevation: 5,
  },

  cityName: {
    fontSize: 23,
    fontWeight: "bold",
    color: "#172B4D",
  },

  weatherIcon: {
    width: 150,
    height: 130,
  },

  weatherEmoji: {
    fontSize: 90,
    height: 130,
    textAlignVertical: "center",
  },

  temperature: {
    fontSize: 70,
    fontWeight: "bold",
    color: "#2878E5",
  },

  unit: {
    fontSize: 14,
    color: "#8793A8",
    marginTop: -5,
  },

  description: {
    fontSize: 19,
    color: "#52627A",
    marginTop: 12,
    marginBottom: 28,
    textTransform: "capitalize",
  },

  detailsContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    width: "100%",
    gap: 8,
  },

  detailBox: {
    flex: 1,
    backgroundColor: "#F3F7FF",
    borderRadius: 15,
    paddingVertical: 15,
    alignItems: "center",
  },

  detailIcon: {
    fontSize: 23,
  },

  detailTitle: {
    fontSize: 11,
    color: "#8793A8",
    marginTop: 7,
  },

  detailValue: {
    fontSize: 15,
    fontWeight: "bold",
    color: "#172B4D",
    marginTop: 5,
  },

  updatedAt: {
    fontSize: 11,
    color: "#A0AABD",
    marginTop: 25,
  },

  offlineText: {
    fontSize: 12,
    color: "#D97706",
    fontWeight: "bold",
    marginTop: 10,
  },

  emptyText: {
    textAlign: "center",
    color: "#8793A8",
    marginTop: 30,
  },
});
