const NVIDIA_MARKERS = ["nvidia", "10de"];
const AMD_MARKERS = ["amd", "advanced micro devices", "1002", "ati technologies"];

export function cpuRuntime(reason = null) {
  return {
    device: "wasm",
    dtype: "q8",
    vendor: "CPU",
    runtime: "CPU · WASM",
    fallbackReason: reason,
  };
}

function readAdapterInfo(adapter) {
  if (adapter?.info) return Promise.resolve(adapter.info);
  if (typeof adapter?.requestAdapterInfo === "function") {
    return adapter.requestAdapterInfo().catch(() => ({}));
  }
  return Promise.resolve({});
}

function identifyVendor(info) {
  const fingerprint = [info?.vendor, info?.description, info?.architecture, info?.device]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  if (NVIDIA_MARKERS.some((marker) => fingerprint.includes(marker))) return "NVIDIA";
  if (AMD_MARKERS.some((marker) => fingerprint.includes(marker))) return "AMD";
  return null;
}

/**
 * @param {any} navigatorLike Injectable browser surface for capability tests.
 */
export async function selectBrowserHardware(navigatorLike = globalThis.navigator) {
  if (!navigatorLike?.gpu?.requestAdapter) {
    return cpuRuntime("WebGPU is unavailable in this browser.");
  }

  try {
    const adapter = await navigatorLike.gpu.requestAdapter({ powerPreference: "high-performance" });
    if (!adapter) return cpuRuntime("No WebGPU adapter was available.");

    const info = await readAdapterInfo(adapter);
    const vendor = identifyVendor(info);
    if (adapter.isFallbackAdapter || info?.isFallbackAdapter) {
      return cpuRuntime("The browser returned a software GPU adapter.");
    }
    if (!vendor) {
      return cpuRuntime("No supported NVIDIA or AMD adapter was identified.");
    }

    return {
      device: "webgpu",
      dtype: "fp16",
      vendor,
      runtime: `${vendor} GPU · WebGPU`,
      fallbackReason: null,
    };
  } catch (error) {
    const detail = error instanceof Error ? error.message : "adapter initialization failed";
    return cpuRuntime(`WebGPU detection failed: ${detail}`);
  }
}
