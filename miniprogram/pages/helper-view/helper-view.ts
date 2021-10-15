// components/helper-view/helper-view.js
// 获取相机帧，创建three场景
import { Frame, FrameAdapter } from './FrameAdapter';
// import { Scene, WebGL1Renderer, PLATFORM } from 'three-platformize';
// import { WechatPlatform } from 'three-platformize/src/WechatPlatform';
import { getNode, objectFit } from './utils';
import * as tf from '@tensorflow/tfjs-core';
import * as webgl from '@tensorflow/tfjs-backend-webgl';
import { setupWechatPlatform } from '../../../tfjs-plugin/wechat_platform';
import { fetchFunc } from '../../../tfjs-plugin/fetch';
import { isAndroid } from './env';
import { setWasmPaths } from '@tensorflow/tfjs-backend-wasm';

if (!import.meta.CUSTOM) {
  setWasmPaths(
    {
      'tfjs-backend-wasm.wasm': '/tfjs-backend-wasm.wasm',
      'tfjs-backend-wasm-simd.wasm': '/tfjs-backend-wasm.wasm',
      'tfjs-backend-wasm-threaded-simd.wasm': '/tfjs-backend-wasm.wasm',
    },
    true,
  );
}

setupWechatPlatform({
  fetchFunc,
  tf,
  webgl,
  canvas: wx.createOffscreenCanvas(),
});

tf.enableProdMode()

/**
 * HelperView
 * 集成展示TensorFlow Demo常用的逻辑
 * 0. 从相机获取数据
 * 1. 编辑three场景
 * 2. 编辑2d canvas
 */

let deps: {
  // scene: Scene;
  // renderer: WebGL1Renderer;

  canvasGL: HTMLCanvasElement;
  canvas2D: HTMLCanvasElement;
  canvasInput: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  inputCtx: CanvasRenderingContext2D;

  frameAdapter: FrameAdapter;
  cameraCtx: WechatMiniprogram.CameraContext;
  cameraListener: WechatMiniprogram.CameraFrameListener;
};

let userInitedResolver;

let userFrameCallback: (frame: Frame, deps: any) => Promise<any> | void;

export type Deps = typeof deps;

const { windowWidth, windowHeight } = wx.getSystemInfoSync()

Component({
  properties: {
    cameraPosition: {
      type: String,
      value: 'front',
    },
  },

  data: {
    FPS: '0',
    backend: '',
    inited: false,
    usingCamera: false,
    switchingBackend: false,

    canvas2DW: null,
    canvas2DH: null,
  },

  behaviors: ['wx://component-export'],
  export() {
    return {
      set: (cfg: {
        onFrame: (frame: Frame, deps: any) => Promise<any> | void;
      }) => {
        userFrameCallback = cfg.onFrame;
        userInitedResolver?.();
      },
      drawCanvas2D(frame: Frame) {
        if (deps) {
          const { ctx, canvas2D } = deps;
          ctx.clearRect(0, 0, canvas2D.width, canvas2D.height);
          canvas2D.width = frame.width;
          canvas2D.height = frame.height;
          // @ts-ignore
          const imageData = canvas2D.createImageData(
            new Uint8Array(frame.data),
            frame.width,
            frame.height,
          );
          ctx.putImageData(imageData, 0, 0);
        }
      },
      start() {
        deps?.cameraListener.start();
      },
      stop() {
        deps?.cameraListener.stop();
      },
    };
  },

  async ready() {
    const userInitPromise = new Promise(resolve => {
      userInitedResolver = resolve;
    });
    wx.showLoading({ title: '初始化中', mask: false });
    console.log('helper view ready');
    // await tf.setBackend('wasm')
    this.setData({ backend: tf.getBackend() });
    const [{ node: canvasGL }] = await getNode('#gl', this);
    const [{ node: canvas2D }] = await getNode('#canvas', this);
    const [{ node: canvasInput }] = await getNode('#canvas-input', this);
    console.log('helper view get canvas node');

    // PLATFORM.set(new WechatPlatform(canvasGL));
    const ctx = canvas2D.getContext('2d') as CanvasRenderingContext2D;
    const inputCtx = canvasInput.getContext('2d') as CanvasRenderingContext2D;
    // const renderer = new WebGL1Renderer({ canvas: canvasGL, antialias: true });
    // const scene = new Scene();
    const cameraCtx = wx.createCameraContext();
    const frameAdapter = new FrameAdapter();
    const cameraListener = cameraCtx.onCameraFrame(
      frameAdapter.triggerFrame.bind(frameAdapter),
    );
    let canvasSizeInited = false;
    // let frameBuffer;
    frameAdapter.onProcessFrame(async frame => {
      if (!canvasSizeInited) {
        const [canvas2DW, canvas2DH] = objectFit(
          frame.width,
          frame.height,
          windowWidth,
          windowHeight * 0.9,
        );
        this.setData({ canvas2DW, canvas2DH });
        canvasSizeInited = true;
      }
      if (userFrameCallback && !this.data.switchingBackend) {
        const t = Date.now();
        // 拷贝当前帧，以免推理完成后帧内容已变化，也可以先把背景绘制或者写到纹理，复制iPhone7大概 0~5ms, 大部分是1ms
        // frame.data = frame.data.slice(0);
        // if (!frameBuffer) frameBuffer = new ArrayBuffer(frame.data.byteLength)
        // const tmp = new Uint8Array(frameBuffer, 0, frame.data.byteLength);
        // tmp.set(new Uint8Array(frame.data), 0);
        // frame.data = tmp.buffer;
        // console.log('copy cost', Date.now() - t)

        userFrameCallback(frame, deps);
        // 留一帧时间去更新视图，不然安卓不会同步显示计算结果
        // if (isAndroid)
        // @ts-ignore
        await new Promise(resolve => canvas2D.requestAnimationFrame(resolve));
        // if (isAndroid) await new Promise(resolve => setTimeout(resolve, 5));
        this.setData({ FPS: (1000 / (Date.now() - t)).toFixed(2) });
      }
    });
    deps = {
      ctx,
      inputCtx,
      // scene,
      canvasGL,
      canvas2D,
      canvasInput,
      // renderer,
      cameraCtx,
      frameAdapter,
      cameraListener,
    };
    // deps.cameraListener.start();
    this.triggerEvent('inited');
    console.log('helper view inited');

    await userInitPromise;
    wx.hideLoading();
    this.onBtnUseCameraClick();
  },

  detached() {
    if (this.data.usingCamera) deps?.cameraListener.stop();
    // PLATFORM.dispose();
    // @ts-ignore
    deps = null;
    // @ts-ignore
    userFrameCallback = null;
  },

  methods: {
    onBtnUseCameraClick() {
      if (!deps) return;
      if (this.data.usingCamera) {
        this.setData({ usingCamera: false });
        deps.cameraListener.stop();
      } else {
        this.setData({ usingCamera: true });
        deps.cameraListener.start();
      }
    },

    onBtnSelectClick() {
      if (!deps) return;
      wx.chooseImage({
        count: 1,
        success: res => {
          const imgPath = res.tempFilePaths[0];
          Promise.all([
            new Promise<WechatMiniprogram.GetImageInfoSuccessCallbackResult>(
              resolve => {
                wx.getImageInfo({
                  src: imgPath,
                  success: resolve,
                });
              },
            ),
            new Promise<HTMLImageElement>(resolve => {
              // @ts-ignore
              const img = deps.canvasInput.createImage();
              img.onload = () => resolve(img);
              img.src = imgPath;
            }),
          ]).then(([{ width, height }, img]) => {
            deps.canvasInput.width = width;
            deps.canvasInput.height = height;
            deps.inputCtx.drawImage(img, 0, 0);
            const imgData = deps.inputCtx.getImageData(0, 0, width, height);
            userFrameCallback?.(imgData, deps);
          });
        },
      });
    },

    async onRadioClick(e) {
      const { backend } = e.target.dataset;
      this.data.switchingBackend = true;
      await tf.setBackend(backend);
      this.data.switchingBackend = false;
      this.setData({ backend: tf.getBackend() });
    },
  },
});
