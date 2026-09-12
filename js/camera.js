const CAMERA_CONSTRAINTS={video:{facingMode:{ideal:'environment'}},audio:false};

export class CameraController {
 constructor(video,mediaDevices=navigator.mediaDevices){this.video=video;this.mediaDevices=mediaDevices;this.stream=null;this.cameraStarting=false;this.wantsCamera=false;this.lifecycleVersion=0;this.startingPromise=null;}
 hasStream(){return this.stream!==null;}
 stop(){this.wantsCamera=false;this.lifecycleVersion++;this.stopCurrentStream();}
 stopCurrentStream(){if(this.stream)this.stream.getTracks().forEach(track=>track.stop());this.stream=null;this.video.srcObject=null;}
 start(){
  this.wantsCamera=true;
  if(this.cameraStarting)return this.startingPromise;
  this.stopCurrentStream();
  this.cameraStarting=true;
  this.startingPromise=this.startUntilCurrent();
  return this.startingPromise;
 }
 async startUntilCurrent(){
  try{
   while(this.wantsCamera){
    const version=this.lifecycleVersion;
    let stream;
    try{stream=await this.mediaDevices.getUserMedia(CAMERA_CONSTRAINTS)}catch(error){if(this.wantsCamera&&version!==this.lifecycleVersion)continue;throw error}
    if(!this.wantsCamera||version!==this.lifecycleVersion){stream.getTracks().forEach(track=>track.stop());continue;}
    this.stream=stream;
    this.video.srcObject=stream;
    await this.video.play();
    if(!this.wantsCamera||version!==this.lifecycleVersion){stream.getTracks().forEach(track=>track.stop());if(this.stream===stream)this.stream=null;if(this.video.srcObject===stream)this.video.srcObject=null;continue;}
    return stream;
   }
   return null;
  }finally{this.cameraStarting=false;this.startingPromise=null;}
 }
}
