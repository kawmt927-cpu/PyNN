/** 浏览器 Geolocation 错误码 → 中文说明 */
export function geolocationErrorMessage(error: unknown): string {
  if (error && typeof error === "object" && "code" in error) {
    const code = (error as GeolocationPositionError).code;
    switch (code) {
      case 1:
        return "定位权限被拒绝，请在浏览器或系统设置中允许访问位置";
      case 2:
        return "无法获取当前位置，请确认设备定位服务已开启";
      case 3:
        return "定位超时，请稍后重试";
      default:
        break;
    }
  }
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return "获取定位失败";
}

export async function getBrowserGeolocation(): Promise<GeolocationPosition> {
  if (typeof navigator === "undefined" || !navigator.geolocation) {
    throw new Error("当前浏览器不支持定位");
  }

  const attempt = (options: PositionOptions) =>
    new Promise<GeolocationPosition>((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(resolve, reject, options);
    });

  try {
    return await attempt({
      enableHighAccuracy: true,
      timeout: 15000,
      maximumAge: 0,
    });
  } catch (firstError) {
    try {
      return await attempt({
        enableHighAccuracy: false,
        timeout: 20000,
        maximumAge: 120_000,
      });
    } catch {
      throw firstError;
    }
  }
}

export function isSecureLocationContext() {
  if (typeof window === "undefined") return true;
  return window.isSecureContext;
}
