import { Stack } from "expo-router";
import { premiumPushStackScreenOptions } from "@/lib/navigation/screenOptions";
import { FeatureRouteGate } from "@/components/routing/FeatureRouteGate";
import { isAccountTypeAvailable } from "@/lib/modes/availability";

/** Business-account onboarding. Unreachable while business accounts are parked for the beta. */
export default function BusinessOnboardingLayout() {
  return (
    <FeatureRouteGate allowed={isAccountTypeAvailable("business")}>
      <Stack screenOptions={premiumPushStackScreenOptions({ headerShown: false })} />
    </FeatureRouteGate>
  );
}
