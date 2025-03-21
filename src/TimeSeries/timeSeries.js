import * as tf from "@tensorflow/tfjs";
import { saveBlob } from "../utils/io";
import { randomGaussian } from "../utils/random";

/*

Things changed from neural network class:

1. No neuro evolution

*/

class NeuralNetwork {
  constructor() {
    // flags
    this.isTrained = false;
    this.isCompiled = false;
    this.isLayered = false;
    /**
     * @type {tf.Sequential | null} - the TensorFlow model
     */
    this.model = null;

    // methods
    this.init = this.init.bind(this);
    this.createModel = this.createModel.bind(this);
    this.addLayer = this.addLayer.bind(this);
    this.compile = this.compile.bind(this);
    this.setOptimizerFunction = this.setOptimizerFunction.bind(this);
    this.train = this.train.bind(this);
    this.predict = this.predict.bind(this);
    this.classify = this.classify.bind(this);
    this.save = this.save.bind(this);
    this.load = this.load.bind(this);

    // initialize
    this.init();
  }

  /**
   * initialize with create model
   */
  init() {
    this.createModel();
  }

  /**
   * creates a sequential model
   * uses switch/case for potential future where different formats are supported
   * @param {*} _type
   */
  createModel(_type = "sequential") {
    switch (_type.toLowerCase()) {
      case "sequential":
        this.model = tf.sequential();
        return this.model;
      default:
        this.model = tf.sequential();
        return this.model;
    }
  }

  /**
   * add layer to the model
   * if the model has 2 or more layers switch the isLayered flag
   * @param {tf.Layer} layer
   * @void
   */
  addLayer(layer) {
    this.model.add(layer);

    // check if it has at least an input and output layer
    if (this.model.layers.length >= 2) {
      this.isLayered = true;
    }
  }

  /**
   * Compile the model
   * if the model is compiled, set the isCompiled flag to true
   * @param {*} _modelOptions
   */
  compile(_modelOptions) {
    this.model.compile(_modelOptions);
    this.isCompiled = true;
  }

  /**
   * Set the optimizer function given the learning rate
   * as a parameter
   * @param {*} learningRate
   * @param {*} optimizer
   */
  setOptimizerFunction(learningRate, optimizer) {
    return optimizer.call(this, learningRate);
  }

  /**
   * Train the model
   * @param {Object} _options
   */
  async train(_options) {
    const TRAINING_OPTIONS = _options;

    const xs = TRAINING_OPTIONS.inputs;
    const ys = TRAINING_OPTIONS.outputs;
    console.log("train", xs, ys);
    const { batchSize, epochs, shuffle, validationSplit, whileTraining } =
      TRAINING_OPTIONS;

    await this.model.fit(xs, ys, {
      batchSize,
      epochs,
      shuffle,
      validationSplit,
      callbacks: whileTraining,
    });

    xs.dispose();
    ys.dispose();

    this.isTrained = true;
  }

  /**
   * returns the prediction as an array synchronously
   * @param {*} _inputs
   */
  predictSync(_inputs) {
    const output = tf.tidy(() => {
      return this.model.predict(_inputs);
    });
    const result = output.arraySync();

    output.dispose();
    _inputs.dispose();

    return result;
  }

  /**
   * returns the prediction as an array
   * @param {*} _inputs
   */
  async predict(_inputs) {
    const output = tf.tidy(() => {
      return this.model.predict(_inputs);
    });
    const result = await output.array();

    output.dispose();
    _inputs.dispose();

    return result;
  }

  /**
   * classify is the same as .predict()
   * @param {*} _inputs
   */
  async classify(_inputs) {
    return this.predict(_inputs);
  }

  /**
   * classify is the same as .predict()
   * @param {*} _inputs
   */
  classifySync(_inputs) {
    return this.predictSync(_inputs);
  }

  // predictMultiple
  // classifyMultiple
  // are the same as .predict()

  /**
   * save the model.json and the weights.bin files
   * @param {string} modelName
   * @return {Promise<void>}
   */
  async save(modelName = "model") {
    await this.model.save(
      tf.io.withSaveHandler(async (data) => {
        this.weightsManifest = {
          modelTopology: data.modelTopology,
          weightsManifest: [
            {
              paths: [`./${modelName}.weights.bin`],
              weights: data.weightSpecs,
            },
          ],
        };
        console.log("data.weightData", data.weightData);
        await saveBlob(
          data.weightData,
          `${modelName}.weights.bin`,
          "application/octet-stream"
        );
        console.log("this.weightsManifest", this.weightsManifest);
        await saveBlob(
          JSON.stringify(this.weightsManifest),
          `${modelName}.json`,
          "text/plain"
        );
      })
    );
  }

  /**
   * loads the model and weights
   * @param {string | FileList | Object} filesOrPath
   */
  async load(filesOrPath) {
    if (filesOrPath instanceof FileList) {
      const files = Array.from(filesOrPath);
      // find the correct files
      const model = files.find(
        (file) => file.name.includes(".json") && !file.name.includes("_meta")
      );
      const weights = files.find((file) => file.name.includes(".bin"));
      // load the model
      this.model = await tf.loadLayersModel(
        tf.io.browserFiles([model, weights])
      );
    } else if (filesOrPath instanceof Object) {
      this.model = await tf.loadLayersModel(
        tf.io.http(filesOrPath.model, {
          // Override the weights path from the JSON weightsManifest
          weightUrlConverter: (weightFileName) => {
            return filesOrPath.weights || weightFileName;
          },
        })
      );
    } else {
      this.model = await tf.loadLayersModel(filesOrPath);
    }

    this.isCompiled = true;
    this.isLayered = true;
    this.isTrained = true;
  }

  /**
   * dispose and release the memory for the model
   */
  dispose() {
    this.model.dispose();
  }
}
export default NeuralNetwork;
