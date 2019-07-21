export interface ResourceFile {
	groups: ResourceGroup[]
	images: ResourceImage[]
}

export interface ResourceGroup {
	name: string
	sprites: ResourceSprite[]
	children?: ResourceGroup[]
}

export type ResourceSprite = ResourceFrame | ResourceAnimation | ResourcePoint | ResourceQuad | ResourceBitmap

interface ResourceSpriteBase {
	type: ResourceImageType
	name: string
}

export interface ResourceAnimationFrame {
	image: string
	top: number
	left: number
	delay: number
}

export interface ResourceAnimation extends ResourceSpriteBase {
	frames: ResourceAnimationFrame[]
}

export interface ResourcePoint extends ResourceSpriteBase {
	top: number
	left: number
}

export interface ResourceQuad extends ResourcePoint {
	width: number
	height: number
}

export interface ResourceBitmap extends ResourceQuad {
	data: string
	scale?: number
}

export interface ResourceFrame extends ResourcePoint {
	image: string
}

export interface ResourceImage {
	width: number
	height: number
	hash: string
	hitmap?: string
}

export const enum ResourceImageType {
	FRAME,
	PROXY,
	POINT,
	TEXT,
	ANIMATION,
	WALKMAP,
	QUAD
}
