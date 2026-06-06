// Side-effect import: run before @sentry/react-native RootApp wrap (expo plugin).
import { initMonitoring } from "@/lib/monitoring/sentry";

initMonitoring();
