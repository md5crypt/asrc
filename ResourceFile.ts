export interface ResourceFile {
	groups: ResourceGroup[]
	images: ResourceImage[]
}

export interface ResourceGroup {
	name: string
	sprites: ResourceSprite[]
	children?: ResourceGroup[]
}

export type ResourceSprite = ResourceFrame | ResourceAnimation

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

export interface ResourceFrame extends ResourceSpriteBase {
	image: string
	top: number
	left: number
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
	TEXT,
	ANIMATION
}
