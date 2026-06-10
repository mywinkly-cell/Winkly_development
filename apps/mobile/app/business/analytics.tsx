import { Redirect } from "expo-router";
import { Routes } from "@/constants/routes";

/** Legacy alias — keep deep links working inside the business mode stack. */
export default function BusinessAnalyticsRoute() {
  return <Redirect href={Routes.businessAnalytics} />;
}
