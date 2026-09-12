/** Capability-only experimental path. Sensor AR remains the production path. */
export async function detectEnhancedAR(navigatorObject=globalThis.navigator){
  if(!navigatorObject?.xr?.isSessionSupported)return false;
  try{return await navigatorObject.xr.isSessionSupported('immersive-ar')}catch(_){return false}
}

export function createEnhancedARState(){return{available:false,enabled:false,session:null}}
