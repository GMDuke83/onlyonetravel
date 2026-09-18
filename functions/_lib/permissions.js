import { fail } from './security.js';
export const roles=['owner','admin','manager','sales','operations','finance','readonly'];
const grants={
  admin:['owner','admin'], audit:['owner','admin','manager'],
  sales:['owner','admin','manager','sales'],
  finance:['owner','admin','manager','finance'],
  operate:['owner','admin','manager','sales','operations'],
  costs:['owner','admin','manager','sales','finance'],
};
export const can=(s,permission)=>s?.role==='staff' && grants[permission]?.includes(s.permissionRole);
export function requirePermission(s,p){if(!can(s,p))fail(403,'permission-denied');}
export const visibility=s=>can(s,'costs')?'staff':'guest';
