<template>
  <div id="menu">
    <!-- <select class="form-select" aria-label="Default select example" v-model="videoStatus.selected" :disabled='videoStatus.isOpen'>
      <option disabled value="">Please select one</option>
      <option v-for="item in videoStatus.camList" :value="item.deviceId" :key="item.deviceId">{{ item.label }}</option>
    </select> -->
    <!-- <span v-if="!modelStatus.isReady">loading AI Model... </span> -->
    <!-- <button type="button" @click="toggleCamera">
      <span v-if="!videoStatus.isOpen">Open Camera</span>
      <span v-else>Close Camera</span>
    </button> -->

    <!-- use the modal component, pass in the prop -->
    <img id="imgsrc" src="../assets/lens.png" style="display: none;">

    <transition name="modal">
      <modal v-if="status.showModal" @close="status.showModal = false">
        <template v-slot:body>
          <div v-for="item in videoStatus.camList"  :key="item.deviceId">
            <input type="radio" name="camName" :id="item.label" :onchange="changeCamera" :value="item.deviceId" v-model="videoStatus.selected">
            <label :for="item.label">{{ item.label }}</label><br>
          </div>
        </template>
        
        <template v-slot:header>
          <h3>select cam</h3>
        </template>
      </modal>
    </transition>
  </div>

  <div id="mainArea">
    <canvas id="output" style="
      object-fit: contain;
      max-height: 100%;
      max-width: 100%;
      flex: 1;
      "/>
    <video id="video" autoplay v-bind="camObj" style="
      -webkit-transform: scaleX(-1);
      transform: scaleX(-1);
      visibility: hidden;
      display: none;
      width: auto;
      height: auto;
      "/>
  </div>

  <div id="statusBar">
    <button id="changedcam" @click="status.showModal = true"></button>
    <button id="takephoto"  @click="screenshot"></button>
    <button id="fullscreen" @click="fullScreenChange"></button>
  </div>
</template>

<script>
import { reactive, onMounted } from 'vue';
import modal from './modal.vue'
import '@tensorflow/tfjs-backend-webgl';
import * as tf from '@tensorflow/tfjs-core';
import * as faceLandmarksDetection from '@tensorflow-models/face-landmarks-detection';
import { api as screenfull } from 'vue-fullscreen'


export default {
  name: 'webcam',
  components: {
    modal
  },
  setup(){
    /**
     * declear  showModal
     **/
    const state = {
      backend: 'webgl',
      maxFaces: 1,
      triangulateMesh: true,
      predictIrises: true,
      modelIsReady: false
    };
    const LEFTEYE = [249,390,373,374,380,381,382,362,398,384,385,386,387,388,466];
    const RIGHTEYE = [246,161,160,159,158,157,173,133,155,154,153,145,144,163,7]
    const NUM_KEYPOINTS = 468;
    const NUM_IRIS_KEYPOINTS = 5;
    const alpha = 0.3
    let video , canvas, model, ctx, image
    
    const status = reactive({
      showModal: false,
    });

    const modelStatus = reactive({
      isReady: false,
    });

    const videoStatus = reactive({
      camList: [],
      selected: '',
      isOpen : false,
    });
    
    const camObj = reactive({
      srcObject: null,
    });
    
    // function isMobile() {
    //   const isAndroid = /Android/i.test(navigator.userAgent);
    //   const isiOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);
    //   return isAndroid || isiOS;
    // }

    /**
     * load available cameras
     **/
    const loadCameras = async() => {
      try{
        /* open a generic stream to get permission to see devices; 
          * Mobile Safari insists */
        await navigator.mediaDevices.getUserMedia({audio: false, video: true});
        let deviceInfos = await navigator.mediaDevices.enumerateDevices()
        for (let i = 0; i !== deviceInfos.length; ++i) {
          let deviceInfo = deviceInfos[i];
          if (deviceInfo.kind === "videoinput") {
            videoStatus.camList.push(deviceInfo);
        }
        }
        videoStatus.selected = videoStatus.camList[0].deviceId
        toggleCamera()
      }catch(e){
        console.log("not supported",e)
      }
    }
    
    /**
     * start camera
     **/
    const createCameraElement = () => {
      // 1.check
      if (videoStatus.selected === ""){
        alert("selct one device")
        return
      }
      // 2.setting
      let constraints = { video: { deviceId: { exact: videoStatus.selected } } };
      // 3.加載
			navigator.mediaDevices
				.getUserMedia(constraints)
				.then(stream => {
					camObj.srcObject = stream;
          videoStatus.isOpen = true;
				})
				.catch(error => {
          console.log(error)
					alert("May the browser didn't support or there is some errors.");
				});
    }

    /**
     * stop Camera
     **/
    const stopCameraStream = () => {
      let tracks = camObj.srcObject.getTracks();
			tracks.forEach(track => {
				track.stop();
			});
    }

     /**
     * change Camera
     **/   
    const changeCamera = () => {
      try{
        toggleCamera()
        toggleCamera()
      }catch(e){
        console.log(e);
      }
    }
    /**
     * toggle Camera
     **/
    const toggleCamera = () => {
      try{
        if(videoStatus.isOpen) {
          stopCameraStream();
          videoStatus.isOpen = false;
        } else {
          createCameraElement();
        }
      }catch(e){
        console.log(e);
      }
    }

    /**
     * 
     **/
    function screenshot(){
      if (!videoStatus.isOpen) return
      if (!state.modelIsReady) return
      let link = document.createElement('a');
      link.download = 'screenshot.png';
      link.href = canvas.toDataURL();
      link.click();
      link.removeChild();
    }

    function fullScreenChange() {
      if (screenfull.isFullscreen) {
        screenfull.exit();
      } else {
        screenfull.request();
      }
    }

    /**
     * render function
     **/
    function distance(a, b) {
      return Math.sqrt(Math.pow(a[0] - b[0], 2) + Math.pow(a[1] - b[1], 2));
    }

    /**
     * render on canvas
     **/
    async function renderPredictions(){
      if (!videoStatus.isOpen) return

      // get the context of canvas
      // const ctx = canvas.getContext("2d");
      // clear the canvas
      // ctx.clearRect(0, 0, canvas.width, canvas.height)
      // draw Image
      // ctx.clearRect(0, 0, canvas.width, canvas.height)
      // if (videoStatus.isOpen){
      //   ctx.drawImage(
      //     video, 0, 0, video.videoWidth, video.videoHeight, 0, 0, video.videoWidth, video.videoHeight);
      // }
      // ctx.drawImage(
      //   video, 0, 0, video.videoWidth, video.videoHeight, 0, 0, video.videoWidth, video.videoHeight);
      
      if (state.modelIsReady){
        const predictions = await model.estimateFaces({
          input: video,
          returnTensors: false,
          flipHorizontal: false,
          predictIrises: state.predictIrises
        });

        ctx.drawImage(
          video, 0, 0, video.videoWidth, video.videoHeight, 0, 0, video.videoWidth, video.videoHeight);
        image = document.getElementById('imgsrc');

        if (predictions.length > 0) {
          predictions.forEach(prediction => {
            const keypoints = prediction.scaledMesh;
            
            // left
            if (keypoints.length > NUM_KEYPOINTS) {
              const leftCenter = keypoints[NUM_KEYPOINTS];
              const leftDiameterY = distance(
                  keypoints[NUM_KEYPOINTS + 4], keypoints[NUM_KEYPOINTS + 2]);
              const leftDiameterX = distance(
                  keypoints[NUM_KEYPOINTS + 3], keypoints[NUM_KEYPOINTS + 1]);

              ctx.save()
              ctx.beginPath();
              ctx.moveTo(...keypoints[263]);
              LEFTEYE.forEach(element => ctx.lineTo(...keypoints[element]));
              ctx.closePath();
              ctx.clip();

              ctx.globalAlpha = alpha
              ctx.drawImage(image, 
                leftCenter[0]-leftDiameterX / 2, leftCenter[1]-leftDiameterY / 2, 
                leftDiameterX*1.3, leftDiameterY*1.3);
              ctx.restore()

              // right
              if (keypoints.length > NUM_KEYPOINTS + NUM_IRIS_KEYPOINTS) {
                const rightCenter = keypoints[NUM_KEYPOINTS + NUM_IRIS_KEYPOINTS];
                const rightDiameterY = distance(
                    keypoints[NUM_KEYPOINTS + NUM_IRIS_KEYPOINTS + 2],
                    keypoints[NUM_KEYPOINTS + NUM_IRIS_KEYPOINTS + 4]);
                const rightDiameterX = distance(
                    keypoints[NUM_KEYPOINTS + NUM_IRIS_KEYPOINTS + 3],
                    keypoints[NUM_KEYPOINTS + NUM_IRIS_KEYPOINTS + 1]);

                ctx.save()
                ctx.beginPath();
                ctx.moveTo(...keypoints[33]);
                RIGHTEYE.forEach(element => ctx.lineTo(...keypoints[element]));
                ctx.closePath();
                ctx.clip();
                
                ctx.globalAlpha = alpha
                ctx.drawImage(image, 
                  rightCenter[0]-rightDiameterX / 2, rightCenter[1]-rightDiameterY / 2, 
                  rightDiameterX*1.2, rightDiameterY*1.2);
                ctx.restore()

              }
            }
          });
        }
      }
      // go loop
      requestAnimationFrame(()=>{
        renderPredictions();
      });
    }

    /**
     * ini model
     **/
    async function initf(){
      // set 
      await tf.setBackend(state.backend);
      // load model
      model = await faceLandmarksDetection.load(
          faceLandmarksDetection.SupportedPackages.mediapipeFacemesh,
          {maxFaces: state.maxFaces});
      state.modelIsReady = true
      console.log('load model')
    }

    /**
     * on Mounted
     **/
    onMounted(()=>{
      if(navigator.mediaDevices.getUserMedia
        ||navigator.mediaDevices.webkitGetUserMedia){
        // init
        loadCameras();
        canvas = document.getElementById("output");
        ctx = canvas.getContext("2d");
        ctx.translate(canvas.width, 0);
        ctx.scale(-1, 1);
        video = document.getElementById("video");
        video.addEventListener('loadeddata', () => {
            canvas.width = video.videoWidth
            canvas.height = video.videoHeight
            renderPredictions();
        })
        initf();
        if (screenfull.isEnabled) {
          // screenfull.on('change', fullScreenChange);
          console.log("fullscreen Enabled");
        } else {
          console.log("iOS doesn't support fullscreen (yet)");
        }
      }else{
        alert("not supported");
      }
    });

    /**
     * return
     **/
    return{
      modelStatus,
      videoStatus,
      camObj,
      status,
      changeCamera,
      screenshot,
      fullScreenChange,
    }
  }
}
</script>

<style>
html, body{
  height: 100%;
}

body {
  margin: 0;    
}

#app {
  font-family: Avenir, Helvetica, Arial, sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  text-align: center;
  color: #2c3e50;
}

button#changedcam {
  left: calc(50% - 24px);
  top: calc(50% - 24px);
  width: 48px;
  height: 48px;
  background-color: #323632; /* Green */
  color: white;
  border-radius: 50%;
  flex: none;
  border: solid 2px #fff;
}
button#takephoto {
  left: calc(50% - 24px);
  top: calc(50% - 24px);
  width: 60px;
  height: 60px;
  background-color: #323632; /* Green */
  color: white;
  border-radius: 50%;
  flex: none;
  border: solid 2px #fff;
}

button#fullscreen {
  left: calc(50% - 24px);
  top: calc(50% - 24px);
  width: 48px;
  height: 48px;
  background-color: #323632; /* Green */
  color: white;
  border-radius: 50%;
  flex: none;
  border: solid 2px #fff;
  background-image: url(https://storage.googleapis.com/material-icons/external-assets/v4/icons/svg/ic_fullscreen_white_24px.svg);
  background-repeat: no-repeat;
  background-size: 100%;
}


@media screen and (orientation: portrait) {
  #app {
    height: 100%;
    margin: 0;
    display: flex;
    flex-direction: column;
    background-color: rgba(148, 148, 148, 0.575)       
  }

  div#menu {
    height: 50px;
    flex: none;
    background-color: rgb(0, 0, 0);
  }

  div#mainArea {
    flex-grow: 1;
    min-height: 0;  /* This is only relevant for Firefox, see note below*/
    overflow:hidden;
    display: flex;
    justify-content: center;
    align-items: center;
  }

  div#statusBar {
    height: 100px;
    flex: none;
    display: flex;
    background-color: #282a28;
    justify-content: space-around;
    align-items: center;
  }
}


@media screen and (orientation: landscape) {
  #app {
    height: 100%;
    margin: 0;
    display: flex;
    flex-direction: row;            
  }

  div#menu {
    width: 50px;
    flex: none;
    background-color: rgb(0, 0, 0);
  }

  div#mainArea {
    flex-grow: 1;
    min-height: 0;  /* This is only relevant for Firefox, see note below*/
    overflow:hidden;
    display: flex;
    justify-content: center;
    align-items: center;
  }

  div#statusBar {
    width: 100px;
    flex: none;
    background-color: #282a28;
    display: flex;
    flex-direction: column;
    justify-content: space-around;
    align-items: center;
  }
}
</style>