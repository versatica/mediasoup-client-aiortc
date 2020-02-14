"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const Aiortc_1 = require("./Aiortc");
const Worker_1 = require("./Worker");
exports.Worker = Worker_1.Worker;
const createFactory = Aiortc_1.Aiortc.createFactory;
exports.createFactory = createFactory;
/**
 * Expose version.
 */
exports.version = '3.0.0';
