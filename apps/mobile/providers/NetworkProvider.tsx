// apps/mobile/providers/NetworkProvider.tsx
// Subscribes to NetInfo, mirrors state into the connectivity store (for API
// gating) and exposes it via context. Renders a persistent offline banner.

import React, { createContext, useContext, useEffect, useState } from "react";
import NetInfo from "@react-native-community/netinfo";
import { deriveIsOnline, setConnectivity, type ConnectivityState } from "@/lib/network/connectivity";
import { OfflineBanner } from "@/components/OfflineBanner";

type NetworkContextValue = {
  isOnline: boolean;
  isConnected: boolean | null;
  isInternetReachable: boolean | null;
};

const NetworkContext = createContext<NetworkContextValue>({
  isOnline: true,
  isConnected: null,
  isInternetReachable: null,
});

export function NetworkProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<ConnectivityState>({
    isConnected: null,
    isInternetReachable: null,
  });

  useEffect(() => {
    const apply = (s: { isConnected: boolean | null; isInternetReachable: boolean | null }) => {
      const next = { isConnected: s.isConnected, isInternetReachable: s.isInternetReachable };
      setConnectivity(next);
      setState(next);
    };
    NetInfo.fetch().then(apply);
    const unsubscribe = NetInfo.addEventListener(apply);
    return () => unsubscribe();
  }, []);

  const isOnline = deriveIsOnline(state);

  return (
    <NetworkContext.Provider
      value={{ isOnline, isConnected: state.isConnected, isInternetReachable: state.isInternetReachable }}
    >
      {children}
      {!isOnline ? <OfflineBanner /> : null}
    </NetworkContext.Provider>
  );
}

export function useNetwork() {
  return useContext(NetworkContext);
}
