import React, { useState, useCallback, useRef, useEffect } from 'react';
import { db } from '../lib/firebase';
import { collection, addDoc, serverTimestamp, Timestamp } from 'firebase/firestore';
import { Button } from './ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Camera, X, Loader2, Check, AlertCircle, Upload, Barcode } from 'lucide-react';
import { motion } from 'motion/react';
import { useDropzone } from 'react-dropzone';
import { AnalysisResult } from '../types';
import { GoogleGenAI } from '@google/genai';
import { BrowserMultiFormatReader, NotFoundException } from '@zxing/library';

interface MealLoggerProps {
  userId: string;
  onClose: () => void;
  onLogged: () => void;
}

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export default function MealLogger({ userId, onClose, onLogged }: MealLoggerProps) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [converting, setConverting] = useState(false);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [servings, setServings] = useState(1);
  const [saving, setSaving] = useState(false);

  const [scanningBarcode, setScanningBarcode] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const readerRef = useRef<BrowserMultiFormatReader | null>(null);

  useEffect(() => {
    return () => {
      if (readerRef.current) {
        readerRef.current.reset();
      }
    };
  }, []);

  const startBarcodeScanner = async () => {
    setScanningBarcode(true);
    setError(null);
    try {
      readerRef.current = new BrowserMultiFormatReader();
      const videoInputDevices = await readerRef.current.listVideoInputDevices();
      const selectedDeviceId = videoInputDevices[0]?.deviceId;
      
      if (!selectedDeviceId) {
        throw new Error('No camera found');
      }

      readerRef.current.decodeFromVideoDevice(selectedDeviceId, videoRef.current, async (result, err) => {
        if (result) {
          stopBarcodeScanner();
          await fetchBarcodeProduct(result.getText());
        }
        if (err && !(err instanceof NotFoundException)) {
          console.error(err);
        }
      });
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Failed to start camera');
      setScanningBarcode(false);
    }
  };

  const stopBarcodeScanner = () => {
    if (readerRef.current) {
      readerRef.current.reset();
    }
    setScanningBarcode(false);
  };

  const fetchBarcodeProduct = async (barcode: string) => {
    setAnalyzing(true);
    setPreview('barcode');
    setError(null);
    try {
      const response = await fetch(`https://world.openfoodfacts.org/api/v0/product/${barcode}.json`);
      const data = await response.json();
      if (data.status !== 1) {
        throw new Error('Product not found in Open Food Facts database');
      }
      const product = data.product;
      const nutrition: AnalysisResult = {
        name: product.product_name,
        calories: Math.round(product.nutriments['energy-kcal_100g'] || 0),
        protein: Math.round(product.nutriments.proteins_100g || 0),
        carbs: Math.round(product.nutriments.carbohydrates_100g || 0),
        fats: Math.round(product.nutriments.fat_100g || 0),
        ingredients: product.ingredients_text ? [{ name: product.ingredients_text, calories: Math.round(product.nutriments['energy-kcal_100g'] || 0) }] : []
      };
      setResult(nutrition);
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Error fetching barcode product');
      setPreview(null);
    } finally {
      setAnalyzing(false);
    }
  };

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    let selectedFile = acceptedFiles[0];
    
    if (selectedFile) {
      setError(null);

      const isHeic = (selectedFile.type === 'image/heic' || selectedFile.type === 'image/heif') || 
                     ((!selectedFile.type || selectedFile.type === '') && 
                      (selectedFile.name.toLowerCase().endsWith('.heic') || selectedFile.name.toLowerCase().endsWith('.heif')));

      if (isHeic) {
        setConverting(true);
        try {
          // First check if it's actually already a JPEG by reading magic bytes
          const header = await selectedFile.slice(0, 4).arrayBuffer();
          const bytes = new Uint8Array(header);
          const isActuallyJpeg = bytes[0] === 0xFF && bytes[1] === 0xD8;

          if (isActuallyJpeg) {
            // iOS already converted it — just rename to .jpg and continue
            selectedFile = new File([selectedFile], 'photo.jpg', { type: 'image/jpeg' });
          } else {
            // Actually needs conversion
            const heic2any = (await import('heic2any')).default;
            const convertedBlob = await heic2any({
              blob: selectedFile,
              toType: 'image/jpeg',
              quality: 0.8
            });

            const blobArray = Array.isArray(convertedBlob) ? convertedBlob : [convertedBlob];
            selectedFile = new File(blobArray, 'photo.jpg', { type: 'image/jpeg' });
          }
        } catch (err: any) {
          console.warn('HEIC conversion failed, trying direct read:', err);
          // Last resort — just try reading it as-is, browser might handle it
          selectedFile = new File([selectedFile], 'photo.jpg', { type: 'image/jpeg' });
        } finally {
          setConverting(false);
        }
      }

      setFile(selectedFile);
      
      const reader = new FileReader();
      reader.onload = (e) => {
        const result = e.target?.result as string;
        setPreview(result);
      };
      reader.readAsDataURL(selectedFile);
      
      setError(null);
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 
      'image/*': ['.jpeg', '.jpg', '.png', '.webp'],
      'image/heic': ['.heic'],
      'image/heif': ['.heif']
    },
    multiple: false,
    noClick: scanningBarcode // prevent opening file dialog if we are clicking inside to use barcode, actually we separate them
  } as any);

  const analyzeImage = async () => {
    if (!file) return;

    setAnalyzing(true);
    setError(null);

    try {
      if (!process.env.GEMINI_API_KEY) {
        throw new Error('GEMINI_API_KEY is not configured.');
      }

      const reader = new FileReader();
      const base64Promise = new Promise<string>((resolve) => {
        reader.onload = () => {
          const base64 = (reader.result as string).split(',')[1];
          resolve(base64);
        };
        reader.readAsDataURL(file);
      });

      const base64 = await base64Promise;

      const prompt = `Identify the food in this image. Provide a JSON response with:
- name (string)
- calories (total number)
- protein (grams)
- carbs (grams)
- fats (grams)
- ingredients: array of objects with { name: string, calories: number }
ONLY return the JSON object, nothing else.`;

      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: [{
          parts: [
            { text: prompt },
            { 
              inlineData: { 
                data: base64, 
                mimeType: file.type || 'image/jpeg' 
              } 
            }
          ]
        }]
      });

      const content = response.text;
      if (!content) throw new Error('Empty response from Gemini AI');

      const jsonMatch = content.match(/\{[\s\S]*\}/);
      const foodData = jsonMatch ? JSON.parse(jsonMatch[0]) : null;

      if (!foodData) {
        throw new Error('Could not parse Gemini response: ' + content);
      }

      setResult(foodData);
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Error communicating with Gemini AI');
    } finally {
      setAnalyzing(false);
    }
  };

  const confirmLog = async () => {
    if (!result || saving) return; // Note we removed !file limitation, so barcode result can also be saved without an image file

    setSaving(true);
    try {
      let compressedBase64 = null;
      
      if (file) {
        const compressImage = (): Promise<string | null> => {
          return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = (e) => {
              const dataUrl = e.target?.result as string;
              const img = new Image();
              img.onload = () => {
                const canvas = document.createElement('canvas');
                canvas.width = 400;
                canvas.height = 400;
                const ctx = canvas.getContext('2d');
                if (ctx) {
                  const aspect = img.width / img.height;
                  let drawWidth, drawHeight, offsetX, offsetY;
                  if (aspect > 1) {
                    drawHeight = 400;
                    drawWidth = 400 * aspect;
                    offsetX = -(drawWidth - 400) / 2;
                    offsetY = 0;
                  } else {
                    drawWidth = 400;
                    drawHeight = 400 / aspect;
                    offsetX = 0;
                    offsetY = -(drawHeight - 400) / 2;
                  }
                  ctx.drawImage(img, offsetX, offsetY, drawWidth, drawHeight);
                  const compressed = canvas.toDataURL('image/jpeg', 0.6);
                  // Ensure we don't return an image larger than Firestore allows (~1MB)
                  if (compressed.length < 1000000) {
                    resolve(compressed);
                  } else {
                    resolve(null);
                  }
                } else {
                  resolve(null);
                }
              };
              img.onerror = () => {
                // If it fails to load, do NOT save original massive file to Firestore
                resolve(null);
              };
              img.src = dataUrl;
            };
            reader.readAsDataURL(file);
          });
        };
        compressedBase64 = await compressImage();
      }

      const mealData: any = {
        name: result.name,
        calories: result.calories * servings,
        protein: result.protein * servings,
        carbs: result.carbs * servings,
        fats: result.fats * servings,
        ingredients: result.ingredients?.map(i => ({...i, calories: i.calories * servings})) || [],
        servings,
        timestamp: Timestamp.now(),
        createdAt: serverTimestamp(),
      };
      
      if (compressedBase64) {
        mealData.imageUrl = compressedBase64;
      }

      await addDoc(collection(db, 'users', userId, 'meals'), mealData);
      
      onLogged();
      onClose();
    } catch (err) {
      console.error('Error saving meal:', err);
      setError('Failed to save meal record');
      setSaving(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 sm:items-center backdrop-blur-sm"
    >
      <motion.div
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        className="w-full max-w-md"
      >
        <Card className="rounded-t-[32px] sm:rounded-[32px] border-[#E8E6E0] bg-white shadow-2xl overflow-hidden p-0">
          <CardHeader className="flex flex-row items-center justify-between p-8 pb-4">
            <CardTitle className="text-2xl font-serif font-bold text-[#2D2D2A]">Log Meal</CardTitle>
            <Button variant="ghost" size="icon" onClick={() => { stopBarcodeScanner(); onClose(); }} className="rounded-full hover:bg-[#F1F3EE]">
              <X className="h-6 w-6 text-[#8E8D8A]" />
            </Button>
          </CardHeader>
          <CardContent className="space-y-8 p-8 pt-0">
            {scanningBarcode ? (
              <div className="space-y-4">
                <div className="relative w-full aspect-square overflow-hidden rounded-[32px] group ring-1 ring-[#E8E6E0] bg-black">
                  <video ref={videoRef} className="w-full h-full object-cover" />
                  <Button
                    size="icon"
                    className="absolute right-6 top-6 h-10 w-10 rounded-full bg-black/40 text-white backdrop-blur-lg hover:bg-black/60 transition-all z-10"
                    onClick={stopBarcodeScanner}
                  >
                    <X className="h-5 w-5" />
                  </Button>
                  <p className="absolute bottom-6 left-0 right-0 text-center text-white text-sm font-bold opacity-80">Scanning barcode...</p>
                </div>
              </div>
            ) : !preview ? (
              <div className="grid grid-cols-2 gap-4">
                <div
                  {...getRootProps()}
                  className={`flex aspect-square cursor-pointer flex-col items-center justify-center rounded-[32px] border-2 border-dashed transition-all duration-300 ${
                    isDragActive ? 'border-[#5A6E4B] bg-[#F1F3EE]' : 'border-[#E8E6E0] bg-[#F8F7F2] hover:border-[#5A6E4B] hover:bg-[#F1F3EE]'
                  }`}
                >
                  <input {...(getInputProps({ capture: 'environment' } as any))} />
                  {converting ? (
                    <div className="flex flex-col items-center justify-center space-y-4 text-center">
                      <Loader2 className="h-8 w-8 animate-spin text-[#5A6E4B] stroke-[3]" />
                      <p className="text-xs font-bold text-[#8E8D8A]">Converting...</p>
                    </div>
                  ) : (
                    <>
                      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white shadow-sm ring-1 ring-[#E8E6E0] mb-4">
                        <Camera className="h-7 w-7 text-[#5A6E4B]" />
                      </div>
                      <p className="font-bold text-[#2D2D2A]">Snap</p>
                      <p className="text-[10px] text-[#8E8D8A] mt-1">Photo</p>
                    </>
                  )}
                </div>

                <div
                  onClick={startBarcodeScanner}
                  className="flex aspect-square cursor-pointer flex-col items-center justify-center rounded-[32px] border-2 border-dashed border-[#E8E6E0] bg-[#F8F7F2] hover:border-[#5A6E4B] hover:bg-[#F1F3EE] transition-all duration-300"
                >
                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white shadow-sm ring-1 ring-[#E8E6E0] mb-4">
                    <Barcode className="h-7 w-7 text-[#5A6E4B]" />
                  </div>
                  <p className="font-bold text-[#2D2D2A]">Scan</p>
                  <p className="text-[10px] text-[#8E8D8A] mt-1">Barcode</p>
                </div>
              </div>
            ) : (
              <div className="space-y-8">
                {preview === 'barcode' ? (
                   <div className="flex items-center justify-center h-32 bg-[#F8F7F2] rounded-[32px] border border-[#E8E6E0]">
                     <Barcode className="h-10 w-10 text-[#8E8D8A]" />
                     <span className="ml-3 font-bold text-[#8E8D8A]">Barcode Scanned</span>
                     <Button
                       size="icon"
                       variant="ghost"
                       className="ml-4 rounded-full"
                       onClick={() => { setFile(null); setPreview(null); setResult(null); }}
                     >
                       <X className="h-4 w-4" />
                     </Button>
                   </div>
                ) : (
                  <div className="relative w-full aspect-square min-h-[250px] overflow-hidden rounded-[32px] group ring-1 ring-[#E8E6E0] bg-[#F8F7F2]">
                    <img 
                      id="image-preview"
                      src={preview} 
                      alt="food"
                      className="transition-transform group-hover:scale-105 duration-700" 
                      style={{ 
                        display: 'block', 
                        width: '100%', 
                        height: '100%', 
                        objectFit: 'cover',
                        borderRadius: '16px'
                      }} 
                    />
                    <Button
                      size="icon"
                      className="absolute right-6 top-6 h-10 w-10 rounded-full bg-black/40 text-white backdrop-blur-lg hover:bg-black/60 transition-all z-10"
                      onClick={() => { setFile(null); setPreview(null); setResult(null); }}
                    >
                      <X className="h-5 w-5" />
                    </Button>
                  </div>
                )}

                {analyzing ? (
                  <div className="flex flex-col items-center justify-center py-12 space-y-6">
                    <div className="relative h-16 w-16">
                      <Loader2 className="h-16 w-16 animate-spin text-[#5A6E4B] stroke-[3]" />
                    </div>
                    <div className="text-center">
                      <p className="text-xl font-bold text-[#2D2D2A]">Analyzing...</p>
                      <p className="text-sm text-[#8E8D8A]">Retrieving nutrition</p>
                    </div>
                  </div>
                ) : result ? (
                  <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="space-y-6 max-h-[50vh] overflow-y-auto pr-2">
                    <div className="rounded-[24px] bg-[#F8F7F2] p-6 border border-[#E8E6E0]">
                      <h4 className="text-xl font-serif font-bold mb-4 flex items-center justify-between text-[#2D2D2A]">
                        {result.name}
                      </h4>
                      
                      {/* Servings Control */}
                      <div className="flex items-center justify-between border-b border-[#E8E6E0] pb-4 mb-4">
                        <span className="font-bold text-[#8E8D8A] text-sm uppercase tracking-widest">Servings</span>
                        <div className="flex items-center gap-4 bg-white rounded-xl ring-1 ring-[#E8E6E0] p-1">
                          <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg" onClick={() => setServings(Math.max(1, servings - 1))}>-</Button>
                          <span className="text-lg font-bold w-6 text-center">{servings}</span>
                          <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg" onClick={() => setServings(servings + 1)}>+</Button>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1">
                          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#8E8D8A]">Calories</p>
                          <p className="text-3xl font-bold text-[#2D2D2A]">{result.calories * servings} <span className="text-xs font-normal text-[#8E8D8A]">kcal</span></p>
                        </div>
                        <div className="grid gap-2">
                          <div className="flex justify-between items-center text-xs border-b border-[#E8E6E0] pb-1">
                            <span className="text-[#8E8D8A] font-medium">Protein</span>
                            <span className="font-bold text-[#2D2D2A]">{result.protein * servings}g</span>
                          </div>
                          <div className="flex justify-between items-center text-xs border-b border-[#E8E6E0] pb-1">
                            <span className="text-[#8E8D8A] font-medium">Carbs</span>
                            <span className="font-bold text-[#2D2D2A]">{result.carbs * servings}g</span>
                          </div>
                          <div className="flex justify-between items-center text-xs">
                            <span className="text-[#8E8D8A] font-medium">Fats</span>
                            <span className="font-bold text-[#2D2D2A]">{result.fats * servings}g</span>
                          </div>
                        </div>
                      </div>
                    </div>
                    <Button className="w-full h-16 bg-[#5A6E4B] text-xl font-bold rounded-[20px] shadow-lg hover:bg-[#4A5E3B] transition-all active:scale-[0.98]" onClick={confirmLog} disabled={saving}>
                      {saving ? <Loader2 className="mr-3 h-6 w-6 animate-spin" /> : <Check className="mr-3 h-6 w-6" />} Log this meal
                    </Button>
                  </motion.div>
                ) : (
                  <div className="space-y-6">
                    {error && (
                      <div className="flex items-center gap-3 rounded-[20px] bg-[#E57373]/10 p-5 text-sm font-medium text-[#E57373]">
                        <AlertCircle className="h-6 w-6 shrink-0" />
                        <p>{error}</p>
                      </div>
                    )}
                    {preview !== 'barcode' && (
                      <Button className="w-full h-16 bg-[#5A6E4B] text-xl font-bold rounded-[20px] shadow-lg hover:bg-[#4A5E3B] transition-all active:scale-[0.98]" onClick={analyzeImage}>
                        <Upload className="mr-3 h-6 w-6" /> Analyze with Gemini AI
                      </Button>
                    )}
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>
    </motion.div>
  );
}
