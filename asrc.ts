import * as fs from "fs"
import * as path from "path"
import { murmurHash64x64 } from "murmurhash-native"
import "ag-psd/initialize-canvas"
import * as AgPsd from "ag-psd"
import { ResourceFile, ResourceFrame, ResourceGroup, ResourceImage, ResourceImageType } from "./ResourceFile"
import { Canvas } from "canvas"

const HITMAP_COMPRESSION = 4

class ResourceCompiler {
	private groups: ResourceGroup[]
	private images: Map<string, ResourceImage>
	private imageDir: string

	constructor(imageDir: string) {
		this.imageDir = imageDir
		this.groups = []
		this.images = new Map()
	}

	public readGroup(layers: AgPsd.Layer[], name: string): ResourceGroup {
		const frames: ResourceFrame[] = []
		const children: ResourceGroup[] = []
		for (const layer of layers) {
			if (layer.children) {
				children.push(this.readGroup(layer.children, layer.name || 'default'))
			} else {
				const nameInfo = (layer.name || 'default').split(':')
				let image: string
				switch (nameInfo[1] || 'frame') {
					case 'frame':
						image = this.registerImage(layer.canvas!, true)
						break
					case 'proxy':
						image = this.registerProxy(layer.canvas!)
						break
					case 'text':
						image = this.registerText(layer.canvas!)
						break
					default:
						throw new Error(`unknown layer type '${nameInfo[1]}' in layer '${nameInfo[0]}'`)
				}
				frames.push({
					name: nameInfo[0],
					left: layer.left || 0,
					top: layer.top || 0,
					image
				})
			}
		}
		const group: ResourceGroup = {name, frames}
		if (children.length) {
			group.children = children
		}
		return group
	}

	public readPsd(file: string) {
		const psd = AgPsd.readPsd(fs.readFileSync(file), { skipCompositeImageData: true, skipThumbnail: true })
		if (!psd.children) {
			throw new Error('empty psd file?')
		}
		for (const layer of psd.children) {
			if (layer.children) {
				this.groups.push(this.readGroup(layer.children, layer.name!))
			} else {
				throw new Error(`non group layer in psd root ('${layer.name}')`)
			}
		}
	}

	public save(output: string) {
		const o: ResourceFile = {
			groups: this.groups,
			images: Array.from(this.images.values())
		}
		fs.writeFileSync(output, JSON.stringify(o))
	}

	private registerText(canvas: HTMLCanvasElement): string {
		const hash = murmurHash64x64(`text_${canvas.width}x${canvas.height}`)
		this.images.set(hash, {
			hash,
			width: canvas.width,
			height: canvas.height,
			type: ResourceImageType.TEXT
		})
		return hash
	}


	private registerProxy(canvas: HTMLCanvasElement): string {
		const hash = murmurHash64x64(`proxy_${canvas.width}x${canvas.height}`)
		this.images.set(hash, {
			hash,
			width: canvas.width,
			height: canvas.height,
			type: ResourceImageType.PROXY
		})
		return hash
	}

	private registerImage(canvas: HTMLCanvasElement, hitmap: boolean): string {
		const image = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height)
		const hash = murmurHash64x64(Buffer.from(image.data.buffer))
		if (!this.images.has(hash)) {
			const resource: ResourceImage = {
				hash,
				width: image.width,
				height: image.height,
				type: ResourceImageType.FRAME
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
fs.readdirSync('.').filter(x => /[.]psd$/.test(x)).forEach(x => (console.log(x), rc.readPsd(x)))
rc.save('resource.json')
