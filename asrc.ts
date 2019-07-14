import * as fs from "fs"
import * as path from "path"
import { murmurHash64x64 } from "murmurhash-native"
import "ag-psd/initialize-canvas"
import * as AgPsd from "ag-psd"
import { ResourceFile, ResourceGroup, ResourceImage, ResourceImageType, ResourceAnimation } from "./ResourceFile"
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

	public readLayer(layer: AgPsd.Layer, group: ResourceGroup, originStack: {left: number, top: number}[], nameStack: string[] = []) {
		const nameInfo = (layer.name || 'default').split(':')
		const name = nameInfo[0] || 'default'
		const fullname = nameStack.length ? (nameStack.join('.') + '.' + name) : name
		if (layer.canvas) {
			const base = {
				name: fullname,
				left: layer.left! + layer.canvas.width / 2 - originStack[originStack.length - 1].left,
				top: layer.top! + layer.canvas.height / 2 - originStack[originStack.length - 1].top
			}
			switch (nameInfo[1]) {
				case 'origin':
					originStack.push({top: layer.top!, left: layer.left!})
					break
				case 'proxy':
					group.sprites.push({
						...base,
						type: ResourceImageType.PROXY,
						image: this.registerProxy(layer.canvas)
					})
					break
				case 'text':
					group.sprites.push({
						...base,
						type: ResourceImageType.TEXT,
						image: this.registerProxy(layer.canvas)
					})
					break
				case undefined:
					if (!layer.children) {
						group.sprites.push({
							...base,
							type: ResourceImageType.FRAME,
							image: this.registerImage(layer.canvas, true)
						})
					}
					break
				default:
					throw new Error(`unknown layer type '${nameInfo[1]}' in layer '${nameInfo[0]}'`)
			}
		} else {
			switch (nameInfo[1]) {
				case 'namespace':
					if (layer.children && layer.children.length) {
						const sp = originStack.length
						nameStack.push(name)
						layer.children.forEach(x => this.readLayer(x, group, originStack, nameStack))
						nameStack.pop()
						originStack.slice(sp)
					}
					break
				case 'animation':
					const animation: ResourceAnimation = {
						frames: [],
						name: fullname,
						type: ResourceImageType.ANIMATION,
					}
					for (const frame of layer.children!) {
						if (!frame.canvas) {
							throw new Error("invalid animation frame")
						}
						animation.frames.push({
							left: frame.left! + frame.canvas.width / 2 + originStack[originStack.length - 1].left,
							top: frame.top! + frame.canvas.height / 2 + originStack[originStack.length - 1].top,
							delay: parseInt(frame.name!.split(':')[1], 10),
							image: this.registerImage(frame.canvas, true)
						})
					}
					group.sprites.push(animation)
					break
				case undefined: {
					const sp = originStack.length
					const newGroup = {
						name: fullname,
						sprites: [],
						children: []
					}
					layer.children!.forEach(x => this.readLayer(x, newGroup, originStack))
					if (newGroup.children.length == 0) {
						delete newGroup.children
					}
					group.children!.push(newGroup)
					originStack.slice(sp)
					break
				} default:
					throw new Error(`unknown layer type '${nameInfo[1]}' in layer '${nameInfo[0]}'`)
			}
		}
	}

	public readPsd(file: string) {
		const psd = AgPsd.readPsd(fs.readFileSync(file), { skipCompositeImageData: true, skipThumbnail: true })
		if (!psd.children) {
			throw new Error('empty psd file?')
		}
		const group = {
			name: 'root',
			sprites: [],
			children: this.groups
		}
		const originStack = [{left: 0, top: 0}]
		psd.children.forEach(x => this.readLayer(x, group, originStack))
		if (group.sprites.length) {
			throw new Error("unexpected sprite")
		}
	}

	public save(output: string) {
		const o: ResourceFile = {
			groups: this.groups,
			images: Array.from(this.images.values())
		}
		fs.writeFileSync(output, JSON.stringify(o))
	}

	private registerProxy(canvas: HTMLCanvasElement): string {
		const hash = `@${canvas.width},${canvas.height}`
		this.images.set(hash, {
			hash,
			width: canvas.width,
			height: canvas.height,
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
