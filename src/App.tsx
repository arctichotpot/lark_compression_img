import { useState, useEffect, useRef, useCallback } from 'react';
import { bitable, ITable, IAttachmentField, Selection } from "@lark-base-open/js-sdk";
import { Button, Divider, Image, Space, Typography, Toast, Spin, Form, Card, Tooltip, Popconfirm, Banner } from '@douyinfe/semi-ui';
import imageCompression from 'browser-image-compression';
import { cloneDeep, debounce } from "lodash";
import { IconInfoCircle } from "@douyinfe/semi-icons";
import './App.css';

import { useTranslation, Trans } from 'react-i18next';



// 定义类型
type ImageItem = {
  url: string;
  file: File;
  name: string;
  size: number;
  type: string;
  token: string;
  timeStamp: number;
};




type ImageRecordList = {
  fieldId: string;
  recordId: string;
  images: ImageItem[];
};



const formatFileSize = (fileSizeInBytes: number): string => {
  if (fileSizeInBytes < 1024) {
    return fileSizeInBytes + " B";
  } else if (fileSizeInBytes < 1024 * 1024) {
    return (fileSizeInBytes / 1024).toFixed(2) + " KB";
  } else if (fileSizeInBytes < 1024 * 1024 * 1024) {
    return (fileSizeInBytes / (1024 * 1024)).toFixed(2) + " MB";
  } else {
    return (fileSizeInBytes / (1024 * 1024 * 1024)).toFixed(2) + " GB";
  }
};


const WHITE_LIST: string[] = ['jpeg', 'png', 'webp', 'bmp', 'jpg']



export default function App() {

  const [imageRecordList, setImageRecordList] = useState<ImageRecordList[]>([]); // 
  const [compressNum, setCompressNum] = useState<number>(60);
  const [pattern, setPattern] = useState<string>('cell');
  const [loading, setLoading] = useState<boolean>(false);

  const tableRef = useRef<ITable | null>(null);
  const selectionFieldRef = useRef<IAttachmentField | null>(null);
  const lastFieldIdRef = useRef<string | null>(null);

  const { t } = useTranslation();


  const isFetchingRef = useRef(false); // 用于标记是否正在获取数据



  const patternRef = useRef(pattern); // 使用 useRef 来跟踪 pattern 的最新值



  useEffect(() => {
    const init = async () => {
      try {
        bitable.base.onSelectionChange(
          handleSelectionChange
          // debounce(handleSelectionChange, 100) // 使用 lodash 的 debounce 方法
        );
      } catch (e) {
        console.log(e);
      }
    };
    init();
    handleSelectionChange()
  }, []);


  const handleSelectionChange = useCallback(async () => {
    if (isFetchingRef.current) {
      console.log("Previous fetch in progress, cancelling...");
      return; // 如果正在获取数据，则取消
    }
    const currentSelection = await bitable.base.getSelection();
    console.log(currentSelection)


    if (currentSelection.fieldId && currentSelection.recordId) {
      if (patternRef.current === 'field' && lastFieldIdRef.current === currentSelection?.fieldId) {
        return;
      }
      lastFieldIdRef.current = currentSelection?.fieldId || null;
      getData(currentSelection);
    } else {
      setImageRecordList([]);
      setLoading(false);
    }
  }, []);



  const onPatternChange = async (pa: string) => {
    patternRef.current = pa; // 每次 pattern 更新时，更新其在 useRef 中的值

    await getData()
  }



  const getData = async (selection?: Selection) => {
    const currentPattern = patternRef.current; // 使用 useRef 中的最新值

    setLoading(true);

    try {
      tableRef.current = await bitable.base.getActiveTable();
      if (!selection) selection = await bitable.base.getSelection();


      // const selection = await bitable.base.getSelection();

      // if (!tableRef.current) {
      //   setImageRecordList([])
      //   setLoading(false);

      //   return;
      // }

      // if (!selection) {
      //   setImageRecordList([])
      //   setLoading(false);
      //   return;
      // }

      const field = await tableRef.current.getField<IAttachmentField>(selection.fieldId as string);

      const meta = await field.getMeta()


      console.log(meta)

      if (!field || meta.type !== 17) {
        setImageRecordList([])
        setLoading(false);
        return;
      }


      selectionFieldRef.current = field;

      let recordList = [];



      if (currentPattern === 'cell') {
        recordList.push(selection.recordId);
      } else {
        const allRecords = await tableRef.current.getRecordList();
        for (const record of allRecords) {
          recordList.push(record.id)
        }
      }



      const images: ImageRecordList[] = await Promise.all(recordList.map(async recordId => {
        let imgs: ImageItem[] = []

        const imgItems = await field.getValue(recordId as string);


        if (imgItems) {

          imgs = await Promise.all(imgItems.filter(img => img.type.startsWith('image')).map(async img => {
            const url = await tableRef.current?.getAttachmentUrl(img.token) as string;
            console.log(img)
            return {
              ...img,
              url,
              file: await fetchImageAsFile(url, img.name)
            };
          }))
        }

        return {
          recordId: recordId as string,
          fieldId: selection?.fieldId as string,
          images: imgs
        };
      }));

      const res: ImageRecordList[] = images.filter(item => item.images.length > 0).map(item => {
        return {
          ...item,
          // 不支持的图片格式
          // images: item.images.filter(img => WHITE_LIST.includes(img.type.split('/')[1]))
        }
      })

      setImageRecordList(res);
    } catch (e) {
      console.error(e);
    } finally {
      isFetchingRef.current = false; // 完成获取数据
      setLoading(false);
    }
  };



  // 压缩
  const handleCompress = async () => {
    setLoading(true)
    const list = cloneDeep(imageRecordList)

    for (const record of list) {
      const arr: ImageItem[] = []
      for (let item of record.images) {

        let file: File | null = null


        if (WHITE_LIST.includes(item.type.split('/')[1])) {
          file = await imageCompression(item.file, {
            maxSizeMB: 2,
            maxWidthOrHeight: 1024,
            useWebWorker: true,
            initialQuality: (100 - compressNum) / 100,
            alwaysKeepResolution: true
          });

        } else file = item.file

        arr.push({ ...item, file })

      }
      record.images = arr
    }

    setImageRecordList(list); // Update state with compressed images
    setLoading(false)
  };

  // 获取照片转File对象
  async function fetchImageAsFile(url: string, name: string): Promise<File> {
    // 使用 fetch 获取图片
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error('Network response was not ok.');
    }
    // 将响应转换为 Blob
    const blob = await response.blob();
    // 创建并返回 File 对象
    return new File([blob], name, { type: blob.type });
  }

  const confirmCompress = async () => {
    setLoading(true)
    try {

      const resArr: boolean[] = []

      for (let item of imageRecordList) {
        const fileList = item.images.map(file => new File([file.file], file.name, { type: file.type }))
        const res = await selectionFieldRef.current?.setValue(item.recordId as string, fileList)
        resArr.push(res as boolean)
      }

      Toast.info(resArr.includes(false) ? t('failed') : t('success'))
      setLoading(false)
    }
    catch (e) {
      setLoading(false)
      console.log(e)
    }

  }


  const ImageListEl = () => {

    return <>
      {
        imageRecordList.map(item => {
          return item.images.map(img => {
            return <Space vertical key={img.name}>
              <Image
                preview={false}
                width={100}
                height={100}
                src={img.url}
              />
              <Typography.Title heading={6} style={{ margin: '8px 0' }} >
                {formatFileSize(img.file.size)}
              </Typography.Title>
            </Space>
          })
        })
      }
    </>


  }

  return (
    <Spin spinning={loading}>
      <main className="main" >
        <Banner
          type="info"
          description={t('banner') + '      ' + WHITE_LIST.join(' , ').toLocaleUpperCase() + '.' + t('banner_tip')}
        />
        <Card >

          <Form onValueChange={values => {
            setPattern(values.pattern as string)
            setCompressNum(values.compressNum as number)

          }} initValues={{ compressNum, pattern }}>
            <Form.Section text={t('title')}>
              <Form.Slider max={100} min={1} field='compressNum' label={
                <Space>
                  <span> {t('size')}:{compressNum}</span>
                  <Tooltip content={t('tip')}>
                    <IconInfoCircle />

                  </Tooltip>
                </Space>
              } />

              <Form.Select field='pattern' label={t('mode')} onChange={e => onPatternChange(e as string)}>
                <Form.Select.Option value="cell">{t('cell')}</Form.Select.Option>
                <Form.Select.Option value="field">{t('field')}</Form.Select.Option>
              </Form.Select>

            </Form.Section>
          </Form>

          <Space>
            <Button disabled={imageRecordList.length === 0 || loading} theme='solid' onClick={handleCompress} >{t('compress')}</Button>
            <Popconfirm
              title={t('popconfirm')}
              onConfirm={confirmCompress}
            >
              <Button disabled={imageRecordList.length === 0 || loading} theme='solid' >{t('apply')}</Button>
            </Popconfirm>

          </Space>
        </Card>

        <Divider margin='12px' />
        {
          imageRecordList.length > 0 ? <ImageListEl /> : ` ${pattern === 'cell' ? t('text_cell') : t('text_field')}`
        }

      </main>
    </Spin>
  )
}
