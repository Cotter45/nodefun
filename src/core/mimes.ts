// (The MIT License)

// Copyright (c) 2014 Jonathan Ong <me@jongleberry.com>
// Copyright (c) 2015-2022 Douglas Christopher Wilson <doug@somethingdoug.com>

// Permission is hereby granted, free of charge, to any person obtaining
// a copy of this software and associated documentation files (the
// 'Software'), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to
// permit persons to whom the Software is furnished to do so, subject to
// the following conditions:

// The above copyright notice and this permission notice shall be
// included in all copies or substantial portions of the Software.

// THE SOFTWARE IS PROVIDED 'AS IS', WITHOUT WARRANTY OF ANY KIND,
// EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.
// IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY
// CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT,
// TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE
// SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

import { get } from "node:https";
import { extname } from "node:path";
import { writeFileSync, readFileSync, existsSync } from "node:fs";

// MIME Database URL
export const MIME_DB_URL =
	"https://raw.githubusercontent.com/jshttp/mime-db/refs/heads/master/db.json";
// Local path to save the MIME database
export const LOCAL_MIME_DB_PATH = "./mime-db.json";

// Function to fetch and save the MIME database
export function fetchAndSaveMimeDb() {
	return new Promise<void>((resolve, reject) => {
		get(MIME_DB_URL, (res) => {
			if (res.statusCode !== 200) {
				reject(new Error(`Failed to fetch MIME DB. Status: ${res.statusCode}`));
				return;
			}

			let data = "";
			res.on("data", (chunk) => {
				data += chunk;
			});

			res.on("end", () => {
				try {
					writeFileSync(LOCAL_MIME_DB_PATH, data, "utf8");
					console.log("MIME DB saved locally.");
					resolve();
				} catch (err) {
					reject(err);
				}
			});
		}).on("error", reject);
	});
}

// Function to load MIME database from the local file
export function loadMimeDb() {
	if (!existsSync(LOCAL_MIME_DB_PATH)) {
		throw new Error(
			"MIME database file not found. Please fetch the database first.",
		);
	}

	const rawData = readFileSync(LOCAL_MIME_DB_PATH, "utf8");
	return JSON.parse(rawData);
}

let mimeDb: Record<string, MimedType> | null = null;

// MIME lookup helper
export function getMimeType(filePath: string): string {
	if (mimeDb === null) {
		mimeDb = loadMimeDb();
	}

	const ext = extname(filePath).toLowerCase();
	for (const mime in mimeDb) {
		if (mimeDb[mime].extensions?.includes(ext.slice(1))) {
			return mime;
		}
	}
	return "application/octet-stream"; // Default fallback
}
