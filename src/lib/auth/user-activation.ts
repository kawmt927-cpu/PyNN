/** 已设置手机号与密码，可用账密或企微直接登录 */
export function isUserActivated(user: {
  phone?: string | null;
  passwordHash?: string | null;
}): boolean {
  return Boolean(user.phone?.trim() && user.passwordHash);
}
