"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const core_1 = require("@actions/core");
const exec_1 = require("@actions/exec");
const node_fs_1 = require("node:fs");
const node_os_1 = require("node:os");
const node_path_1 = require("node:path");
async function action() {
    const settings = resolveSettings();
    const args = ["-d", "-r", "-m", "*"];
    if (settings)
        args.push("-s", settings);
    else
        args.push("-allowDefaults");
    const [included, ignored] = await listAllFiles();
    const cwd = process.cwd();
    const { formatted, skipped, failed } = await format(args, included.map((name) => (0, node_path_1.join)(cwd, name)));
    if (ignored.length) {
        (0, core_1.debug)(`Ignored (${ignored.length})\n${ignored
            .map((path) => "   " + path + "\n")
            .join("")}`);
    }
    if (formatted.length) {
        (0, core_1.debug)(`Formatted well (${formatted.length})\n${formatted
            .map((path) => "   " + path + "\n")
            .join("")}`);
    }
    if (skipped.length) {
        (0, core_1.debug)(`Skipped (${skipped.length})\n${skipped
            .map((path) => "   " + path + "\n")
            .join("")}`);
    }
    if (failed.length) {
        (0, core_1.error)(`Failed (${failed.length})\n${failed
            .map((path) => "   " + path + "\n")
            .join("")}`);
        (0, core_1.setFailed)("Some files are not formatted!");
        process.exit(1);
    }
}
exports.default = action;
async function format(args, files) {
    const skipped = new Set();
    const formatted = new Set();
    const failed = new Set();
    let out = "";
    await (0, exec_1.exec)("idea" + ideaExecExt(), ["format", ...args, ...files], {
        listeners: { stdout: (data) => (out += data.toString()) },
        silent: true,
        ignoreReturnCode: true,
    });
    const startIndex = 10 + process.cwd().length;
    for (const line of out.split(/\r?\n/g)) {
        if (!line.startsWith("Checking "))
            continue;
        if (line.endsWith("...Needs reformatting")) {
            failed.add(line.slice(startIndex, -21));
            continue;
        }
        else if (line.endsWith("...Formatted well")) {
            formatted.add(line.slice(startIndex, -17));
            continue;
        }
        const skippedIndex = line.lastIndexOf("...Skipped,");
        if (skippedIndex === -1)
            continue;
        skipped.add(line.slice(startIndex, skippedIndex));
    }
    return {
        formatted: [...formatted],
        skipped: [...skipped],
        failed: [...failed],
    };
}
async function listAllFiles(ignorePattern = /((^(((\.git|\.idea|\.gradle|gradle)(\/|\\))|((gradlew(\.bat)?)$)))|((\/|\\)(build(\/|\\)(classes|resources|kotlin|jacoco|test-results|tmp|reports))(\/|\\))|((\/|\\)bin(\/|\\)(main|test)))/) {
    let out = "";
    await (0, exec_1.exec)("sh", [
        "-c",
        "( git status --short| grep '^?' | cut -d\\  -f2- && git ls-files ) | sort -u",
    ], {
        listeners: {
            stdout: (data) => (out += data.toString()),
        },
        silent: true,
    });
    const ignored = [];
    const included = [];
    for (const name of out.trim().split(/[\r\n\t]+/g)) {
        if (ignorePattern.test(name)) {
            ignored.push(name);
        }
        else {
            included.push(name);
        }
    }
    return [included, ignored];
}
function resolveSettings() {
    let settingsPath = (0, core_1.getInput)("settings", {
        required: false,
        trimWhitespace: true,
    }) || "";
    if (!settingsPath)
        settingsPath = ".idea/codeStyles/Project.xml";
    settingsPath = (0, node_path_1.resolve)(process.cwd(), settingsPath);
    if (!(0, node_fs_1.existsSync)(settingsPath)) {
        (0, core_1.warning)(`Settings '${settingsPath}' was not found, allowing defaults!`);
        return;
    }
    return settingsPath;
}
function ideaExecExt(os = (0, node_os_1.type)()) {
    switch (os) {
        case "Linux":
            return ".sh";
        case "Darwin":
            return "";
        case "Windows":
            return ".exe";
        default:
            throw new Error(`Unsupported os '${os}'`);
    }
}
