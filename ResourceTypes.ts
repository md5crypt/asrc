export interface Resources {
	locations: LocationResource[]
	images: ImageResource[]
}

export interface LocationResource {
	path: string
	frames: FrameResource[]
	objects: ObjectResource[]
}

export interface ObjectResource {
	name: string
	frames: FrameResource[]
}

export interface FrameResource {
	name: string
	image: string
	top: number
	left: number
}

export interface ImageResource {
	width: number
	height: number
	hash: string
	hitmap?: string
}
