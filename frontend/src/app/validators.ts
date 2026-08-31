/** AntD form rule: phone must be exactly 11 digits (passes when empty, for optional fields). */
export const phoneRule = {
  validator: (_: any, value: any) =>
    !value || /^\d{11}$/.test(String(value))
      ? Promise.resolve()
      : Promise.reject(new Error('رقم الهاتف يجب أن يكون ١١ رقماً')),
}
