/**
 * Location display helpers — consistent "City, Country" with full country names (not ISO codes).
 */
export {
  expandCountryForDisplay,
  formatDefaultLocationDisplay,
  normalizeLocationDisplayString,
  localityFromLocationString,
  sameLocality,
} from "./countryDisplay";
export { getDeviceLocationDisplay, reverseGeocodeToDisplay, type DeviceLocationResult } from "./deviceLocation";
export { updateMyLocationOnAppOpen, type UpdateLocationResult } from "./updateLocation";
export { searchCities, type CityCountry } from "./citySearch";
export { useFormatLocationDisplay, useNormalizedLocation } from "./useLocationDisplay";
