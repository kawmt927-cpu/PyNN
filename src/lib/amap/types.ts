export type ResolvedCheckInLocation = {
  /** 高德 GCJ-02 纬度 */
  latitude: number;
  /** 高德 GCJ-02 经度 */
  longitude: number;
  locationText: string;
  addressProvince: string;
  addressCity: string;
  addressDistrict: string;
  /** 街道/乡镇 + 门牌号 */
  addressStreet: string;
};
