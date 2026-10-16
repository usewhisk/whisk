"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  createCloudClient,
  type CloudClient,
  type VerifyResult,
} from "./client.js";

type WhiskCloudContextValue = {
  client: CloudClient | null;
  verify: VerifyResult | null;
};

const WhiskCloudContext = createContext<WhiskCloudContextValue>({
  client: null,
  verify: null,
});

export function WhiskCloudProvider({
  appId,
  baseUrl,
  children,
}: {
  appId: string | undefined;
  baseUrl?: string;
  children: ReactNode;
}) {
  const client = useMemo<CloudClient | null>(() => {
    if (!appId) return null;
    return createCloudClient({ appId, ...(baseUrl && { baseUrl }) });
  }, [appId, baseUrl]);

  const [verify, setVerify] = useState<VerifyResult | null>(null);

  useEffect(() => {
    if (!client) {
      if (appId === undefined) {
        console.warn(
          "[whisk] appId is not set on createWhiskConfig. Widget runs today, but this becomes required within 30 days. Get one at https://cloud.usewhisk.xyz.",
        );
      }
      return;
    }
    let cancelled = false;
    client
      .verify()
      .then((v) => {
        if (!cancelled) setVerify(v);
      })
      .catch(() => {
        /* client already logs */
      });
    return () => {
      cancelled = true;
    };
  }, [appId, client]);

  const value = useMemo(() => ({ client, verify }), [client, verify]);

  return (
    <WhiskCloudContext.Provider value={value}>
      {children}
    </WhiskCloudContext.Provider>
  );
}

export function useWhiskCloud(): WhiskCloudContextValue {
  return useContext(WhiskCloudContext);
}
