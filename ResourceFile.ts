export interface ResourceFile {
	groups: ResourceGroup[]
	images: ResourceImage[]
}

export interface ResourceGroup {
	name: string
	frames: ResourceFrame[]
	children?: ResourceGroup[]
}

export interface ResourceFrame {
	name: string
	image: string
	top: number
	left: number
}

export interface ResourceImage {
	width: number
	height: number
	hash: string
	hitmap?: string
	placeholder?: boolean
}
