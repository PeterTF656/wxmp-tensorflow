import * as faceLandmarksDetection from '../../../tfjs-models-sync/face-landmarks';
import * as tf from '@tensorflow/tfjs-core';
import { Deps } from '../helper-view/helper-view'
import { onePixel } from '../helper-view/utils'

const NUM_KEYPOINTS = 468;
const NUM_IRIS_KEYPOINTS = 5;
const GREEN = '#32EEDB';
const RED = "#FF2C35";
const BLUE = "#157AB3";

function distance(a, b) {
  return Math.sqrt(Math.pow(a[0] - b[0], 2) + Math.pow(a[1] - b[1], 2));
}

Page({
  helper: null as any,

  data: {
    iris: false
  },

  onRadioClick() {
    console.log('here')
    this.setData({ iris: !this.data.iris })
  },

  async onReady() {
    console.log('face-landmarks onReady')
    await tf.ready()
    console.log('tf ready')
    const helper = this.selectComponent('#helper');
    console.log('face-landmarks load start')
    const model = await faceLandmarksDetection.load(
      faceLandmarksDetection.SupportedPackages.mediapipeFacemesh,
      {
        maxFaces: 1,
        modelUrl: 'https://cdn.static.oppenlab.com/weblf/test/facemesh/model.json',
        irisModelUrl: 'https://cdn.static.oppenlab.com/weblf/test/iris/model.json',
        shouldLoadIrisModel: true,
      });
    console.log('face-landmarks load end')
    const t = Date.now()
    model.estimateFaces({ input: onePixel, returnTensors: false, flipHorizontal: false, predictIrises: false })
    console.log('face-landmarks warm up', Date.now() - t)

    const onFrame = (frame, deps: Deps) => {
      const { ctx } = deps;
      // const video: tf.Tensor = tf.tidy(() => {
      //   const temp = tf.tensor(new Uint8Array(frame.data), [frame.height, frame.width, 4]);
      //   return tf.slice(temp, [0, 0, 0], [-1, -1, 3]);
      // });
      const video = {
        width: frame.width,
        height: frame.height,
        data: new Uint8Array(frame.data),
      }

      // 先渲染背景再渲染推理结果
      helper.drawCanvas2D(frame);

      const t = Date.now()
      const predictions = model.estimateFaces({ input: video, returnTensors: false, flipHorizontal: false, predictIrises: this.data.iris })
      // console.log('predict cost', Date.now() - t)

      if (predictions.length > 0) {
        // helper.stop()
        predictions.forEach(prediction => {
          const keypoints = prediction.scaledMesh;

          ctx.fillStyle = GREEN;
          for (let i = 0; i < NUM_KEYPOINTS; i++) {
            const x = keypoints[i][0];
            const y = keypoints[i][1];

            ctx.beginPath();
            ctx.arc(x, y, 1 /* radius */, 0, 2 * Math.PI);
            ctx.fill();
          }

          if (keypoints.length > NUM_KEYPOINTS) {
            ctx.strokeStyle = RED;
            ctx.lineWidth = 1;

            const leftCenter = keypoints[NUM_KEYPOINTS];
            const leftDiameterY = distance(
              keypoints[NUM_KEYPOINTS + 4],
              keypoints[NUM_KEYPOINTS + 2]);
            const leftDiameterX = distance(
              keypoints[NUM_KEYPOINTS + 3],
              keypoints[NUM_KEYPOINTS + 1]);

            ctx.beginPath();
            ctx.ellipse(leftCenter[0], leftCenter[1], leftDiameterX / 2, leftDiameterY / 2, 0, 0, 2 * Math.PI);
            ctx.stroke();

            if (keypoints.length > NUM_KEYPOINTS + NUM_IRIS_KEYPOINTS) {
              const rightCenter = keypoints[NUM_KEYPOINTS + NUM_IRIS_KEYPOINTS];
              const rightDiameterY = distance(
                keypoints[NUM_KEYPOINTS + NUM_IRIS_KEYPOINTS + 2],
                keypoints[NUM_KEYPOINTS + NUM_IRIS_KEYPOINTS + 4]);
              const rightDiameterX = distance(
                keypoints[NUM_KEYPOINTS + NUM_IRIS_KEYPOINTS + 3],
                keypoints[NUM_KEYPOINTS + NUM_IRIS_KEYPOINTS + 1]);

              ctx.beginPath();
              ctx.ellipse(rightCenter[0], rightCenter[1], rightDiameterX / 2, rightDiameterY / 2, 0, 0, 2 * Math.PI);
              ctx.stroke();
            }
          }
        });
      }
    }

    helper.set({ onFrame });
    this.helper = helper;
  },

  onShow: function () {
    this.helper?.start();
  },

  onHide: function () {
    this.helper?.stop();
  },

  onUnload: function () { },

  onShareAppMessage: function () { },
});
