// Downloading what walking needs, once and only when it is needed: the paths and the addresses
// are a few megabytes, of no use until someone types an address.

import { readWalkGraph, type WalkGraph } from "./graph.ts";
import { readAddresses, type AddressBook } from "./addresses.ts";

export type Walking = { graph: WalkGraph; book: AddressBook };

let loading: Promise<Walking> | null = null;

export function loadWalking(): Promise<Walking> {
  loading ??= Promise.all([download("walk.bin"), download("addresses.json")])
    .then(async ([graph, book]) => ({
      graph: readWalkGraph(await graph.arrayBuffer()),
      book: readAddresses(await book.json()),
    }))
    .catch((error) => {
      loading = null; // the next time it is needed, it is tried again
      throw error;
    });
  return loading;
}

async function download(path: string): Promise<Response> {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`Could not load ${path} (${response.status})`);
  return response;
}
