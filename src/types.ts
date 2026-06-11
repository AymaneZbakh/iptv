/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface IPTVChannel {
  id: string;
  name: string;
  url: string;
  logo: string | null;
  group: string;
  epgId: string | null;
}

export interface EPGProgramme {
  title: string;
  desc: string;
  start: string; // ISO string
  stop: string;  // ISO string
  channelId: string;
}

export interface EPGCurrentShow {
  current: EPGProgramme | null;
  next: EPGProgramme | null;
  progress: number; // 0 to 100 percentage
}

export interface PlaylistInfo {
  id: string;
  name: string;
  url: string;
  isCustom: boolean;
}
