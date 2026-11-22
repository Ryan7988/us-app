import { QueryClient } from "@tanstack/react-query";
import { createAsyncStoragePersister } from "@tanstack/query-async-storage-persister";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { del, get, set } from "idb-keyval";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import "./index.css";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 7 * 24 * 3600_000, // 離線時仍保留最後資料
      retry: 1,
      networkMode: "offlineFirst",
    },
    mutations: { networkMode: "online" }, // 離線時不送出寫入（iOS 沒有 Background Sync）
  },
});

// 已載入的清單存進 IndexedDB，離線開 App 也看得到
const persister = createAsyncStoragePersister({
  storage: { getItem: get, setItem: set, removeItem: del },
  key: "us-app-query-cache",
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{ persister, maxAge: 7 * 24 * 3600_000, buster: __APP_VERSION__ }}
      // 先顯示 IndexedDB 裡的舊資料，再背景重抓（App 可能在寫入快取前就被 iOS 關掉）
      onSuccess={() => queryClient.invalidateQueries()}
    >
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </PersistQueryClientProvider>
  </StrictMode>,
);
