import { debug, error, getInput, setFailed, warning } from "@actions/core";
import { exec } from "@actions/exec";
import { existsSync } from "node:fs";
import { type } from "node:os";
import { join, resolve } from "node:path";

export default async function action() {
	const settings = resolveSettings();

	const args: string[] = ["-d", "-r", "-m", "*"];

	if (settings) args.push("-s", settings);
	else args.push("-allowDefaults");

	const [included, ignored] = await listAllFiles();

	const cwd = process.cwd();
	const { formatted, skipped, failed } = await format(
		args,
		included.map((name) => join(cwd, name)),
	);

	if (ignored.length) {
		debug(
			`Ignored (${ignored.length})\n${ignored
				.map((path) => "   " + path + "\n")
				.join("")}`,
		);
	}

	if (formatted.length) {
		debug(
			`Formatted well (${formatted.length})\n${formatted
				.map((path) => "   " + path + "\n")
				.join("")}`,
		);
	}

	if (skipped.length) {
		debug(
			`Skipped (${skipped.length})\n${skipped
				.map((path) => "   " + path + "\n")
				.join("")}`,
		);
	}

	if (failed.length) {
		error(
			`Failed (${failed.length})\n${failed
				.map((path) => "   " + path + "\n")
				.join("")}`,
		);

		setFailed("Some files are not formatted!");
		process.exit(1);
	}
}

async function format(args: string[], files: string[]) {
	const skipped = new Set<string>();
	const formatted = new Set<string>();
	const failed = new Set<string>();

	let out = "";
	await exec("idea" + ideaExecExt(), ["format", ...args, ...files], {
		listeners: {
			stdout: (data) => {
				const str = data.toString();
				out += str;
				debug(str);
			},
		},
		silent: true,
		ignoreReturnCode: true,
	});

	const startIndex = 10 + process.cwd().length;
	for (const line of out.split(/\r?\n/g)) {
		if (!line.startsWith("Checking ")) continue;
		if (line.endsWith("...Needs reformatting")) {
			failed.add(line.slice(startIndex, -21));
			continue;
		} else if (line.endsWith("...Formatted well")) {
			formatted.add(line.slice(startIndex, -17));
			continue;
		}
		const skippedIndex = line.lastIndexOf("...Skipped,");
		if (skippedIndex === -1) continue;
		skipped.add(line.slice(startIndex, skippedIndex));
	}

	return {
		formatted: [...formatted],
		skipped: [...skipped],
		failed: [...failed],
	};
}

async function listAllFiles(
	ignorePattern = /((^(((\.git|\.idea|\.gradle|gradle)(\/|\\))|((gradlew(\.bat)?)$)))|((\/|\\)(build(\/|\\)(classes|resources|kotlin|jacoco|test-results|tmp|reports))(\/|\\))|((\/|\\)bin(\/|\\)(main|test)))/,
) {
	let out = "";
	await exec(
		"sh",
		[
			"-c",
			"( git status --short| grep '^?' | cut -d\\  -f2- && git ls-files ) | sort -u",
		],
		{
			listeners: {
				stdout: (data) => (out += data.toString()),
			},
			silent: true,
		},
	);

	const ignored: string[] = [];
	const included: string[] = [];

	for (const name of out.trim().split(/[\r\n\t]+/g)) {
		if (ignorePattern.test(name)) {
			ignored.push(name);
		} else {
			included.push(name);
		}
	}
	return [included, ignored];
}

function resolveSettings() {
	let settingsPath =
		getInput("settings", {
			required: false,
			trimWhitespace: true,
		}) || "";
	if (!settingsPath) settingsPath = ".idea/codeStyles/Project.xml";
	settingsPath = resolve(process.cwd(), settingsPath);
	if (!existsSync(settingsPath)) {
		warning(`Settings '${settingsPath}' was not found, allowing defaults!`);
		return;
	}
	return settingsPath;
}

function ideaExecExt(os = type()) {
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
