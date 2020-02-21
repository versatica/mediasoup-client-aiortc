"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const Worker_1 = require("./Worker");
exports.createWorker = Worker_1.createWorker;
exports.Worker = Worker_1.Worker;
const media_1 = require("./media");
exports.createMediaStream = media_1.createMediaStream;
const FakeMediaStream_1 = require("./FakeMediaStream");
exports.FakeMediaStream = FakeMediaStream_1.FakeMediaStream;
/**
 * Expose version.
 */
exports.version = '3.1.2';
/**
 * Exponse a function to create a HandlerFactory.
 */
function createHandlerFactory(worker) {
    return worker.createHandlerFactory();
}
exports.createHandlerFactory = createHandlerFactory;
