export enum ImpactStyle {
  Heavy = 'HEAVY',
  Medium = 'MEDIUM',
  Light = 'LIGHT',
}

export const hapticImpact = async (_style = ImpactStyle.Medium) => {}
export const hapticSuccess = async () => {}
export const hapticSelection = async () => {}