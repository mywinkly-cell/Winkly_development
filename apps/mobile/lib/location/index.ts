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
export {
  updateMyLocationOnAppOpen,
  getLocationPrecision,
  setLocationPrecision,
  type UpdateLocationResult,
  type LocationPrecision,
} from "./updateLocation";
export {
  getModeLocationCopy,
  hasShownModeLocationRationale,
  markModeLocationRationaleShown,
  modeLocationRationaleKey,
  type ModeLocationCopy,
} from "./modeLocationPrompt";
export { searchCities, type CityCountry } from "./citySearch";
export { useFormatLocationDisplay, useNormalizedLocation } from "./useLocationDisplay";
