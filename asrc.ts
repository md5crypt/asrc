import * as fs from "fs"
import * as path from "path"
import { murmurHash64x64 } from "murmurhash-native"
import "ag-psd/initialize-canvas"
import * as AgPsd from "ag-psd"
import * as ResourceTypes from "./ResourceTypes"
import { Canvas } from "canvas"

const HITMAP_COMPRESSION = 4

class ResourceCompiler {
	private locations: ResourceTypes.LocationResource[]
	private images: Map<string, ResourceTypes.ImageResource>
	private imageDir: string

	constructor(imageDir: string) {
		this.imageDir = imageDir
		this.locations = []
		this.images = new Map()
	}

	public readObject(layers: AgPsd.Layer[], name: string): ResourceTypes.ObjectResource {
		const frames: ResourceTypes.FrameResource[] = []
		for (const layer of layers) {
			if (!layer.name || !layer.canvas || layer.name[0] != '@') {
				console.log(`skipping layer ${layer.name}`)
				continue
			}
			frames.push({
				name: layer.name.slice(1) || 'default',
				left: layer.left || 0,
				top: layer.top || 0,
				image: this.registerImage(layer.canvas, true)
			})
		}
		return {name, frames}
	}

	public readLocationPsd(file: string) {
		const psd = AgPsd.readPsd(fs.readFileSync(file), {  skipCompositeImageData: true, skipThumbnail: true })
		if (!psd.children) {
			throw new Error('empty psd file?')
		}
		const name = path.parse(file).name
		const layers = psd.children
		const objects: ResourceTypes.ObjectResource[] = []
		const frames: ResourceTypes.FrameResource[] = []
		for (const layer of layers) {
			if (layer.children) {
				objects.push(this.readObject(layer.children, layer.name!))
			} else if (layer.name![0] == '@') {
				frames.push({
					name: layer.name!.slice(1) || 'default',
					left: layer.left || 0,
					top: layer.top || 0,
					image: this.registerImage(layer.canvas!, false)
				})
			}
		}
		this.locations.push({path: name, frames, objects})
	}

	public save(output: string) {
		const o: ResourceTypes.Resources = {
			locations: this.locations,
			images: Array.from(this.images.values())
		}
		fs.writeFileSync(output, JSON.stringify(o))
	}

	private registerImage(canvas: HTMLCanvasElement, hitmap: boolean) {
		const image = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height)
		const hash = murmurHash64x64(Buffer.from(image.data.buffer))
		if (!this.images.has(hash)) {
			const resource: ResourceTypes.ImageResource = {
				hash,
				width: image.width,
				height: image.height
			}
			if (hitmap) {
				const hitmapArray = ResourceCompiler.buildHitmap(image.data, image.width, image.height, HITMAP_COMPRESSION)
				resource.hitmap = Buffer.from(hitmapArray.buffer).toString('base64').match(/[^=]*/)![0]
			}
			this.images.set(hash, resource)
			fs.writeFileSync(path.join(this.imageDir, hash + '.png'), (canvas as any as Canvas).toBuffer())
		}
		return hash
	}

	private static buildHitmap(data: Uint8Array | Uint8ClampedArray, xsize: number, ysize: number, compression: number) {
		const size = (Math.ceil(Math.sqrt(xsize * ysize) / compression) + 3) & ~3
		const bits = size * 8
		const xdiv = Math.floor(Math.sqrt((bits * xsize) / ysize))
		const ydiv = Math.floor(bits / xdiv)
		const xstep = Math.ceil(xsize / xdiv)
		const ystep = Math.ceil(ysize / ydiv)
		const buckets = new Uint32Array(bits)

		let ybucket = 0
		for (let y = 0; y < ysize; y += 1) {
			let xbucket = 0
			for (let x = 0; x < xsize; x += 1) {
				if (data[(((y * xsize) + x) * 4) + 3]) {
					buckets[(ybucket * xdiv) + xbucket] += 1
				}
				if ((x % xstep) == (xstep - 1)) {
					xbucket += 1
				}
			}
			if ((y % ystep) == (ystep - 1)) {
				ybucket += 1
			}
		}

		const out = new Uint8Array(size)
		let byte = 0
		for (let i = 0; i < bits; i++) {
			byte >>= 1
			if (buckets[i] > ((xstep * ystep) / 2)) {
				byte |= 0x80
			}
			if ((i % 8) == 7) {
				out[i >> 3] = byte
				byte = 0
			}
		}
		return out
	}
}

const rc = new ResourceCompiler('images')
rc.readLocationPsd('village.psd')
rc.save('resource.json')
